// 1. Константи (у тебе вони можуть бути свої)
const PRODUCT_DISCOUNTS = {
  '7045256052785': 17,
  '7053728710705': 0,
  '6702024392753': 13,
  '7053449297969': 0,
  '7097853771825': 0,
};

// 2. Допоміжна функція для отримання відсотка знижки
function getDiscountPercent(productId) {
  const id = String(productId);
  if (id in PRODUCT_DISCOUNTS) return PRODUCT_DISCOUNTS[id];
  return 10;
}

// 3. Основна логіка оновлення підписки
async function updateSubscription(subscriptionId, price, discountPercent) {
  // Отримуємо поточні дані підписки
  const getResponse = await fetch(
    `https://api.rechargeapps.com/subscriptions/${subscriptionId}`,
    {
      headers: {
        'X-Recharge-Access-Token': process.env.RECHARGE_API_KEY,
        'X-Recharge-Version': '2021-11'
      }
    }
  );

  const getData = await getResponse.json();
  const subscription = getData.subscription;

  if (!subscription) {
    console.log(`❌ Subscription ${subscriptionId} not found`);
    return;
  }

  const originalPrice = (price / (1 - discountPercent / 100)).toFixed(2);
  const discount = (originalPrice - price).toFixed(2);

  // --- ЗАПОБІЖНИК: Перевіряємо, чи вже встановлені правильні значення ---
  const currentOrigPrice = subscription.properties?.find(p => p.name === '_subscription_original_price')?.value;
  const currentDiscount = subscription.properties?.find(p => p.name === '_subscription_discount')?.value;

  if (currentOrigPrice === `$${originalPrice}` && currentDiscount === `$${discount}`) {
    console.log(`⏭ Subscription ${subscriptionId} already has correct properties. Skipping to avoid loop.`);
    return;
  }

  // Фільтруємо старі проперті
  const otherProps = (subscription?.properties || []).filter(
    p => p.name !== '_subscription_original_price' && p.name !== '_subscription_discount' && p.name !== '_recharge_webhook'
  );

  const updatedProperties = [
    ...otherProps,
    { name: '_subscription_original_price', value: `$${originalPrice}` },
    { name: '_subscription_discount', value: `$${discount}` },
    { name: '_recharge_webhook', value: 'true' }
  ];

  const putResponse = await fetch(
    `https://api.rechargeapps.com/subscriptions/${subscriptionId}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Recharge-Access-Token': process.env.RECHARGE_API_KEY,
        'X-Recharge-Version': '2021-11'
      },
      body: JSON.stringify({ properties: updatedProperties })
    }
  );

  const putData = await putResponse.json();
  console.log(`✅ Recharge status: ${putResponse.status}`);
}

// 4. ГОЛОВНИЙ ОБРОБНИК (ЦЕ ТЕ, ЩО ШУКАЄ VERCEL)
export default async function handler(req, res) {
  // Перевірка методу
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const topic = req.headers['x-recharge-topic'];
  console.log(`📩 Webhook topic: ${topic}`);

  try {
    // Обробка для Subscription (Created/Updated)
    if (req.body?.subscription) {
      const sub = req.body.subscription;
      const productId = String(sub.external_product_id?.ecommerce || sub.shopify_product_id || '');
      const discountPercent = getDiscountPercent(productId);

      if (discountPercent > 0) {
        await updateSubscription(sub.id, parseFloat(sub.price), discountPercent);
      }
    }

    // Обробка для Charge (Created)
    if (req.body?.charge) {
      const charge = req.body.charge;
      const lineItems = charge.line_items || [];

      for (const item of lineItems) {
        if (item.purchase_item_type === 'onetime') continue;

        const subId = item.purchase_item_id;
        if (!subId) continue;

        const productId = String(item.external_product_id?.ecommerce || item.shopify_product_id || '');
        const discountPercent = getDiscountPercent(productId);

        if (discountPercent > 0) {
          const price = parseFloat(item.unit_price || item.price);
          await updateSubscription(subId, price, discountPercent);
        }
      }
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('🔥 Error in handler:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

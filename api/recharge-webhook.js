const PRODUCT_DISCOUNTS = {
  '7045256052785': 17,
  '7053728710705': 0,
  '6702024392753': 13,
  '7053449297969': 0,
  '7097853771825': 0,
}

function getDiscountPercent(productId) {
  const id = String(productId)
  if (id in PRODUCT_DISCOUNTS) return PRODUCT_DISCOUNTS[id]
  return 10
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const topic = req.headers['x-recharge-topic']
  console.log(`📩 Webhook topic: ${topic}`)

  // Підписка
  const subscription = req.body?.subscription
  if (subscription) {
    const productId = String(
      subscription.external_product_id?.ecommerce ||
      subscription.shopify_product_id ||
      ''
    );
    const discountPercent = getDiscountPercent(productId)

    console.log(`📦 Subscription: ${subscription.id}, product: ${productId}, discount: ${discountPercent}%`)

    if (discountPercent === 0) {
      console.log(`⏭ 0% discount, skipping`)
      return res.status(200).json({ skipped: true })
    }

    const price = parseFloat(subscription.price)
    const originalPrice = (price / (1 - discountPercent / 100)).toFixed(2)
    const discount = (originalPrice - price).toFixed(2)

    console.log(`💰 price: $${price}, original: $${originalPrice}, discount: $${discount}`)

    // Зберігаємо існуючі properties + додаємо наші
    const otherProps = (subscription.properties || []).filter(
      p => p.name !== '_subscription_original_price' && p.name !== '_subscription_discount'
    )

    const updatedProperties = [
      ...otherProps,
      { name: '_subscription_original_price', value: `$${originalPrice}` },
      { name: '_subscription_discount', value: `$${discount}` }
    ]

    const response = await fetch(
      `https://api.rechargeapps.com/subscriptions/${subscription.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Recharge-Access-Token': process.env.RECHARGE_API_KEY,
          'X-Recharge-Version': '2021-11'
        },
        body: JSON.stringify({ properties: updatedProperties })
      }
    )

    const responseData = await response.json()
    console.log(`✅ Recharge status: ${response.status}`)
    console.log(`✅ Recharge response: ${JSON.stringify(responseData)}`)
    return res.status(200).json({ ok: true })
  }

  console.log('⏭ No subscription data, skipping')
  return res.status(200).json({ skipped: true })
}

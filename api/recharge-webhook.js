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

async function updateSubscription(subscriptionId, price, discountPercent) {
  // Get current properties
  const getResponse = await fetch(
    `https://api.rechargeapps.com/subscriptions/${subscriptionId}`,
    {
      headers: {
        'X-Recharge-Access-Token': process.env.RECHARGE_API_KEY,
        'X-Recharge-Version': '2021-11'
      }
    }
  )
  const getData = await getResponse.json()
  const subscription = getData.subscription

  const originalPrice = (price / (1 - discountPercent / 100)).toFixed(2)
  const discount = (originalPrice - price).toFixed(2)

  console.log(`💰 price: $${price}, original: $${originalPrice}, discount: $${discount} (${discountPercent}%)`)

  const otherProps = (subscription?.properties || []).filter(
    p => p.name !== '_subscription_original_price' && p.name !== '_subscription_discount'
  )

  const updatedProperties = [
    ...otherProps,
    { name: '_subscription_original_price', value: `$${originalPrice}` },
    { name: '_subscription_discount', value: `$${discount}` },
    { name: '_recharge_webhook', value: 'true' }
  ]

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
  )

  const putData = await putResponse.json()
  console.log(`✅ Recharge status: ${putResponse.status}`)
  console.log(`✅ Recharge response: ${JSON.stringify(putData)}`)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const topic = req.headers['x-recharge-topic']
  console.log(`📩 Webhook topic: ${topic}`)

  // subscription/created or subscription/updated
  if (req.body?.subscription) {
    const subscription = req.body.subscription

    const productId = String(
      subscription.external_product_id?.ecommerce ||
      subscription.shopify_product_id || ''
    )
    const discountPercent = getDiscountPercent(productId)

    console.log(`📦 Subscription: ${subscription.id}, product: ${productId}, discount: ${discountPercent}%`)

    if (discountPercent === 0) {
      console.log(`⏭ 0% discount, skipping`)
      return res.status(200).json({ skipped: true })
    }

    const price = parseFloat(subscription.price)
    await updateSubscription(subscription.id, price, discountPercent)
    return res.status(200).json({ ok: true })
  }

  // charge/created 
  if (req.body?.charge) {
    const charge = req.body.charge
    const lineItems = charge.line_items || []

    for (const item of lineItems) {
      // Пропускаємо onetime продукти!
      if (item.purchase_item_type === 'onetime') {
        console.log(`⏭ Skipping onetime item`)
        continue
      }

      const subscriptionId = item.purchase_item_id
      if (!subscriptionId) continue

      const productId = String(
        item.external_product_id?.ecommerce ||
        item.shopify_product_id || ''
      )
      const discountPercent = getDiscountPercent(productId)

      console.log(`📦 Charge item: subscription ${subscriptionId}, product: ${productId}, discount: ${discountPercent}%`)

      if (discountPercent === 0) {
        console.log(`⏭ 0% discount, skipping`)
        continue
      }

      const price = parseFloat(item.unit_price || item.price)
      await updateSubscription(subscriptionId, price, discountPercent)
    }

    return res.status(200).json({ ok: true })
  }

  console.log('⏭ No relevant data, skipping')
  return res.status(200).json({ skipped: true })
}

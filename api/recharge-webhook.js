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

  const order = req.body?.order
  if (!order) {
    console.log('⏭ Skipped - no order data')
    return res.status(200).json({ skipped: true })
  }

  const lineItems = order.line_items || []
  console.log(`📦 Order: ${order.id}, items: ${lineItems.length}`)

  for (const item of lineItems) {
    const subscriptionId = item.subscription_id
    if (!subscriptionId) {
      console.log(`⏭ No subscription_id, skipping`)
      continue
    }

    const price = parseFloat(item.price)
    const discountPercent = getDiscountPercent(item.shopify_product_id)

    if (discountPercent === 0) {
      console.log(`⏭ Product ${item.shopify_product_id} - 0% discount, skipping`)
      continue
    }

    const originalPrice = (price / (1 - discountPercent / 100)).toFixed(2)
    const discount = (originalPrice - price).toFixed(2)

    console.log(`💰 Product: ${item.shopify_product_id}, price: $${price}, original: $${originalPrice}, discount: $${discount} (${discountPercent}%)`)

    const updatedProperties = [
      { name: '_subscription_original_price', value: `$${originalPrice}` },
      { name: '_subscription_discount', value: `$${discount}` }
    ]

    const response = await fetch(
      `https://api.rechargeapps.com/subscriptions/${subscriptionId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Recharge-Access-Token': process.env.RECHARGE_API_KEY,
          'X-Recharge-Version': '2021-01'
        },
        body: JSON.stringify({ properties: updatedProperties })
      }
    )

    console.log(`✅ Recharge response: ${response.status} for subscription ${subscriptionId}`)
  }

  return res.status(200).json({ ok: true })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const order = req.body?.order
  if (!order) {
    return res.status(200).json({ skipped: true })
  }

  const lineItems = order.line_items || []

  for (const item of lineItems) {
    const subscriptionId = item.subscription_id
    if (!subscriptionId) continue

    const price = parseFloat(item.price)
    const originalPrice = (price / 0.9).toFixed(2)
    const discount = (originalPrice - price).toFixed(2)

    const updatedProperties = [
      { name: '_subscription_original_price', value: `$${originalPrice}` },
      { name: '_subscription_discount', value: `$${discount}` }
    ]

    await fetch(
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
  }

  return res.status(200).json({ ok: true })
}

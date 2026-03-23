export default async function handler(req, res) {
  // Тільки POST запити від Recharge
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const subscription = req.body?.subscription
  if (!subscription) {
    return res.status(400).json({ error: 'No subscription data' })
  }

  // Ціна підписки (те що платить клієнт)
  const subscriptionPrice = parseFloat(subscription.price)

  // compare_at_price — звичайна ціна (береться з Recharge)
  const compareAtPrice = parseFloat(subscription.presentment_amount ?? subscription.compare_at_price ?? 0)

  // Різниця = discount
  const discount = (compareAtPrice - subscriptionPrice).toFixed(2)

  // Якщо нема різниці — нічого не робимо
  if (discount <= 0 || isNaN(discount)) {
    return res.status(200).json({ skipped: true })
  }

  // Зберігаємо існуючі properties + додаємо нашу
  const otherProps = (subscription.properties || []).filter(
    p => p.name !== '_subscription_discount'
  )

  const updatedProperties = [
    ...otherProps,
    { name: '_subscription_discount', value: `$${discount}` }
  ]

  // Записуємо в підписку через Recharge API
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

  if (!response.ok) {
    const err = await response.text()
    return res.status(500).json({ error: err })
  }

  return res.status(200).json({ ok: true, discount: `$${discount}` })
}

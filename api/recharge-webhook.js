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
  const subscription = getData.subscription // ЦЬОГО РЯДКА НЕ ВИСТАЧАЛО

  if (!subscription) return // Захист, якщо підписку не знайдено

  const originalPrice = (price / (1 - discountPercent / 100)).toFixed(2)
  const discount = (originalPrice - price).toFixed(2)

  const currentOrigPrice = subscription.properties?.find(p => p.name === '_subscription_original_price')?.value
  const currentDiscount = subscription.properties?.find(p => p.name === '_subscription_discount')?.value

  if (currentOrigPrice === `$${originalPrice}` && currentDiscount === `$${discount}`) {
    console.log(`⏭ Subscription ${subscriptionId} already has correct properties. Skipping...`)
    return
  }

  const otherProps = (subscription.properties || []).filter(
    p => p.name !== '_subscription_original_price' && p.name !== '_subscription_discount'
  )

  const updatedProperties = [
    ...otherProps,
    { name: '_subscription_original_price', value: `$${originalPrice}` },
    { name: '_subscription_discount', value: `$${discount}` }
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

  console.log(`✅ Recharge status: ${putResponse.status}`)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Subscription created/updated
    if (req.body?.subscription) {
      const sub = req.body.subscription
      const productId = String(sub.external_product_id?.ecommerce || sub.shopify_product_id || '')
      const discountPercent = getDiscountPercent(productId)

      if (discountPercent > 0) {
        await updateSubscription(sub.id, parseFloat(sub.price), discountPercent)
      }
    }

    // Charge created
    if (req.body?.charge) {
      const charge = req.body.charge
      for (const item of (charge.line_items || [])) {
        if (item.purchase_item_type === 'onetime') continue
        
        const subId = item.purchase_item_id
        if (!subId) continue

        const productId = String(item.external_product_id?.ecommerce || item.shopify_product_id || '')
        const discountPercent = getDiscountPercent(productId)

        if (discountPercent > 0) {
          const price = parseFloat(item.unit_price || item.price)
          await updateSubscription(subId, price, discountPercent)
        }
      }
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}

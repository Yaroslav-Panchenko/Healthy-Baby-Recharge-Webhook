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


  const currentOrigPrice = subscription.properties?.find(p => p.name === '_subscription_original_price')?.value
  const currentDiscount = subscription.properties?.find(p => p.name === '_subscription_discount')?.value

  if (currentOrigPrice === `$${originalPrice}` && currentDiscount === `$${discount}`) {
    console.log(`⏭ Subscription ${subscriptionId} already has correct properties. Skipping...`)
    return; 
  }

  const otherProps = (subscription?.properties || []).filter(
    p => p.name !== '_subscription_original_price' && p.name !== '_subscription_discount' && p.name !== '_recharge_webhook'
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

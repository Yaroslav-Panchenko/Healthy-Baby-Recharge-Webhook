// Helper to convert title to Shopify handle
function titleToHandle(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Fetch dynamic price data from Shopify frontend JSON
async function getShopifyProductData(title, variantId) {
  const handle = titleToHandle(title)
  try {
    const res = await fetch(`https://healthybaby.com/products/${handle}.json`)
    if (!res.ok) return null
    const data = await res.json()
    // Find the specific variant to get the correct prices
    return data?.product?.variants?.find(v => String(v.id) === String(variantId)) || null
  } catch (err) {
    console.error(`❌ Error fetching JSON for ${handle}:`, err)
    return null
  }
}

async function updateSubscription(subscriptionId, currentPrice, originalPrice) {
  // Calculate discount amount and percentage dynamically
  const discountAmount = (originalPrice - currentPrice).toFixed(2)
  const discountPercent = Math.round(((originalPrice - currentPrice) / originalPrice) * 100)

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

  if (!subscription) return

  // Avoid infinite loops by checking the original price property
  // const existingOrigPrice = subscription?.properties?.find(p => p.name === '_subscription_original_price')?.value
  // if (existingOrigPrice === `$${originalPrice.toFixed(2)}`) {
  //   return console.log('⏭ Already updated, skipping')
  // }

  console.log(`💰 Updating: Current $${currentPrice}, Original $${originalPrice.toFixed(2)} (${discountPercent}%)`)
  console.log(`💰 price: $${price}, original: $${originalPrice}, discount: $${discount} (${discountPercent}%)`)
  
  const otherProps = (subscription?.properties || []).filter(
    p => !['_subscription_original_price', '_subscription_discount', '_recharge_webhook'].includes(p.name)
  )

  const updatedProperties = [
    ...otherProps,
    { name: '_subscription_original_price', value: `$${originalPrice.toFixed(2)}` },
    { name: '_subscription_discount', value: `$${discountAmount}` },
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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  
    const topic = req.headers['x-recharge-topic']
    console.log(`📩 Webhook topic: ${topic}`)
  
  const charge = req.body?.charge
  if (charge) {
    const lineItems = charge.line_items || []

    for (const item of lineItems) {
      if (item.purchase_item_type === 'onetime') continue

      const subscriptionId = item.purchase_item_id
      const variantId = item.external_variant_id.ecommerce
      
      const currentPrice = parseFloat(item.unit_price || item.price)

      // 1. Fetch live data from Shopify
      const shopifyVariant = await getShopifyProductData(item.title, variantId)
      const productId = String(
        item.external_product_id?.ecommerce ||
        item.shopify_product_id || ''
      )
      console.log(shopifyVariant);
      console.log(`📦 Charge item: subscription ${subscriptionId}, product: ${productId}`)
      

      if (!shopifyVariant) {
        console.log(`⚠️ Skip: Variant ${variantId} not found in JSON`)
        continue
      }

      const originalPrice = parseFloat(shopifyVariant.price)

      // 3. Update Recharge with dynamic values
      await updateSubscription(subscriptionId, currentPrice, originalPrice)
    }
    return res.status(200).json({ ok: true })
  }

  return res.status(200).json({ skipped: true })
}

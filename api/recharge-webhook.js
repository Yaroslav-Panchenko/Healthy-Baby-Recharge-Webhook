// Helper to convert title to Shopify handle
function titleToHandle(title) {
  if (!title) return ''
  return title
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Fetch dynamic price data from Shopify frontend JSON
async function getShopifyProductData(title, variantId) {
  let handle = titleToHandle(title);
  if (handle === 'our-wet-wipes') handle = 'wet-wipes-2'

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

async function updateSubscription(subscriptionId, originalPrice, discountValue) {
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

  if (!subscription) return

  const currentPriceProp = subscription?.properties?.find(p => p.name === '_subscription_original_price')?.value;
  const currentDiscountProp = subscription?.properties?.find(p => p.name === '_subscription_discount')?.value;
  if (currentPriceProp === `$${originalPrice}` && currentDiscountProp === `$${discountValue}`) return console.log('⏭ Already updated, skipping to avoid loop')

  console.log('Current subscription', subscription)
  // console.log(`💰 currentPrice: $${subscription.price}, originalPrice: $${originalPrice}, discountValue: $${discountValue}`)

  const otherProps = (subscription?.properties || []).filter(
    p => p.name !== '_subscription_original_price' && p.name !== '_subscription_discount' && p.name !== '_recharge_webhook'
  )

  const updatedProperties = [
    ...otherProps,
    { name: '_subscription_original_price', value: `$${originalPrice}` },
    { name: '_subscription_discount', value: `$${discountValue}` },
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
  console.log(`✅ Updated subscription data: ${JSON.stringify(putData)}`)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const topic = req.headers['x-recharge-topic']
  console.log(`📩 Webhook topic: ${topic}`)
  console.log(`📩 Webhook data`, req.body?.charge?.line_items)

  // charge
  if (req.body?.charge) {
    const charge = req.body.charge
    const lineItems = charge.line_items || []

    for (const item of lineItems) {
      if (item.purchase_item_type === 'onetime') {
        console.log(`⏭ Skipping onetime item`)
        continue
      }

      const subscriptionId = item.purchase_item_id;
      if (!subscriptionId) continue

      const productId = item.external_product_id?.ecommerce;
      const variantId = item.external_variant_id?.ecommerce;
      const currentPrice = parseFloat(item.unit_price || item.price);
      const shopifyVariant = await getShopifyProductData(item.title, variantId);
      let originalPrice = 0
      let discountValue = 0

      if (shopifyVariant) {
        originalPrice = Number(shopifyVariant.price)
        discountValue = Number((originalPrice - currentPrice).toFixed(2))
      } else {
        const discountPercent = getDiscountPercent(productId)
        originalPrice = Number((currentPrice / (1 - discountPercent / 100)).toFixed(2))
        discountValue = Number((originalPrice - currentPrice).toFixed(2))
      }

      if (discountValue <= 0) {
        console.log('⏭  0% discount, skipping')
        continue
      }

      await updateSubscription(subscriptionId, originalPrice, discountValue)
    }

    return res.status(200).json({ ok: true })
  }

  console.log('⏭ No relevant data, skipping');
  return res.status(200).json({ skipped: true })
}

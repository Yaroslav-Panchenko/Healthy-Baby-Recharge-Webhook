import { URLSearchParams } from 'node:url'

const SHOP = process.env.SHOPIFY_SHOP
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET

if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
  throw new Error('Set SHOPIFY_SHOP, SHOPIFY_CLIENT_ID, and SHOPIFY_CLIENT_SECRET.')
}

let shopifyToken = null
let shopifyTokenExpiresAt = 0

async function getShopifyToken() {
  if (shopifyToken && Date.now() < shopifyTokenExpiresAt - 60_000) return shopifyToken

  const response = await fetch(
    `https://${SHOP}.myshopify.com/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    }
  )

  if (!response.ok) throw new Error(`Shopify token error: ${response.status}`)
  const { access_token, expires_in } = await response.json()
  shopifyToken = access_token
  shopifyTokenExpiresAt = Date.now() + expires_in * 1000
  return shopifyToken
}

async function getVariantPrices(variantId) {
  const token = await getShopifyToken()

  const query = `{
    productVariant(id: "gid://shopify/ProductVariant/${variantId}") {
      compareAtPrice
      price
    }
  }`

  const response = await fetch(
    `https://${SHOP}.myshopify.com/admin/api/2025-01/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query }),
    }
  )

  const data = await response.json()
  const variant = data?.data?.productVariant
  console.log(`🛍 Shopify variant: price=${variant?.price}, compareAtPrice=${variant?.compareAtPrice}`)
  return variant
}

async function updateSubscription(subscriptionId, variantId) {
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

  const variant = await getVariantPrices(variantId)
  if (!variant?.compareAtPrice) {
    console.log(`⏭ No compareAtPrice for variant ${variantId}, skipping`)
    return
  }

  const price = parseFloat(variant.price)
  const compareAtPrice = parseFloat(variant.compareAtPrice)
  const discount = (compareAtPrice - price).toFixed(2)

  if (discount <= 0) {
    console.log(`⏭ No discount, skipping`)
    return
  }

  console.log(`💰 price: $${price}, original: $${compareAtPrice}, discount: $${discount}`)

  const otherProps = (subscription?.properties || []).filter(
    p => p.name !== '_subscription_original_price' &&
         p.name !== '_subscription_discount' &&
         p.name !== '_recharge_webhook'
  )

  const updatedProperties = [
    ...otherProps,
    { name: '_subscription_original_price', value: `$${compareAtPrice.toFixed(2)}` },
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

  if (!req.body?.charge) {
    console.log('⏭ No charge data, skipping')
    return res.status(200).json({ skipped: true })
  }

  const charge = req.body.charge
  const lineItems = charge.line_items || []

  for (const item of lineItems) {
    if (item.purchase_item_type === 'onetime') {
      console.log(`⏭ Skipping onetime item`)
      continue
    }

    const subscriptionId = item.purchase_item_id
    if (!subscriptionId) continue

    const variantId = item.external_variant_id?.ecommerce
    if (!variantId) continue

    console.log(`📦 Charge item: subscription ${subscriptionId}, variant ${variantId}`)
    await updateSubscription(subscriptionId, variantId)
  }

  return res.status(200).json({ ok: true })
}

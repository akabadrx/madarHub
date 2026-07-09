/**
 * Pesapal API 3.0 Server Utility
 *
 * Handles OAuth authentication, IPN registration, order submission,
 * and transaction status queries. All calls are server-side only.
 *
 * Environment Variables Required:
 *   PESAPAL_CONSUMER_KEY
 *   PESAPAL_CONSUMER_SECRET
 *   PESAPAL_BASE_URL (sandbox: https://cybqa.pesapal.com/pesapalv3 | live: https://pay.pesapal.com/v3)
 *   PESAPAL_IPN_ID (obtained after registering IPN URL)
 */

// ─── In-memory token cache ───────────────────────────────────────────────────
let cachedToken: string | null = null
let tokenExpiry: number = 0

/**
 * Get Pesapal OAuth access token, with in-memory caching.
 * Token is valid for 5 minutes; we refresh 30s before expiry.
 */
export async function getAccessToken(): Promise<string> {
    const now = Date.now()

    // Return cached token if still valid (with 30s buffer)
    if (cachedToken && now < tokenExpiry - 30_000) {
        return cachedToken
    }

    const baseUrl = process.env.PESAPAL_BASE_URL
    const consumerKey = process.env.PESAPAL_CONSUMER_KEY
    const consumerSecret = process.env.PESAPAL_CONSUMER_SECRET

    if (!baseUrl || !consumerKey || !consumerSecret) {
        const missing = []
        if (!baseUrl) missing.push("PESAPAL_BASE_URL")
        if (!consumerKey) missing.push("PESAPAL_CONSUMER_KEY")
        if (!consumerSecret) missing.push("PESAPAL_CONSUMER_SECRET")

        throw new Error(`[PESAPAL] Missing environment variables: ${missing.join(", ")}`)
    }

    console.log("[PESAPAL] Requesting new access token...")

    const response = await fetch(`${baseUrl}/api/Auth/RequestToken`, {
        method: "POST",
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            consumer_key: consumerKey,
            consumer_secret: consumerSecret,
        }),
    })

    if (!response.ok) {
        const errorText = await response.text()
        console.error("[PESAPAL] Token request failed:", response.status, errorText)
        throw new Error(`[PESAPAL] Failed to get access token: ${response.status}`)
    }

    const data = await response.json()

    if (data.error) {
        console.error("[PESAPAL] Token error:", data.error)
        throw new Error(`[PESAPAL] Token error: ${data.error.message || JSON.stringify(data.error)}`)
    }

    cachedToken = data.token
    // Parse expiry date from Pesapal response
    tokenExpiry = new Date(data.expiryDate).getTime()

    console.log("[PESAPAL] Access token obtained, expires:", data.expiryDate)

    return cachedToken!
}

// ─── IPN Registration ────────────────────────────────────────────────────────

interface RegisterIPNResponse {
    url: string
    ipn_id: string
    ipn_notification_type_description: string
    ipn_status_description: string
    error: unknown
    status: string
}

/**
 * Register an IPN URL with Pesapal.
 * This should be called once; the returned ipn_id is stored in PESAPAL_IPN_ID.
 */
export async function registerIPN(ipnUrl: string): Promise<RegisterIPNResponse> {
    const token = await getAccessToken()
    const baseUrl = process.env.PESAPAL_BASE_URL!

    console.log("[PESAPAL] Registering IPN URL:", ipnUrl)

    const response = await fetch(`${baseUrl}/api/URLSetup/RegisterIPN`, {
        method: "POST",
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
            url: ipnUrl,
            ipn_notification_type: "GET",
        }),
    })

    if (!response.ok) {
        const errorText = await response.text()
        console.error("[PESAPAL] IPN registration failed:", response.status, errorText)
        throw new Error(`[PESAPAL] IPN registration failed: ${response.status}`)
    }

    const data = await response.json()
    console.log("[PESAPAL] IPN registered successfully. IPN ID:", data.ipn_id)

    return data
}

// ─── Submit Order Request ────────────────────────────────────────────────────

interface SubmitOrderParams {
    merchantReference: string
    amount: number
    currency: string
    description: string
    callbackUrl: string
    customerEmail: string
    customerFirstName?: string
    customerLastName?: string
    customerPhone?: string
}

interface SubmitOrderResponse {
    order_tracking_id: string
    merchant_reference: string
    redirect_url: string
    error: unknown
    status: string
}

/**
 * Submit a payment order to Pesapal.
 * Returns a redirect URL where the customer completes payment.
 */
export async function submitOrderRequest(params: SubmitOrderParams): Promise<SubmitOrderResponse> {
    const token = await getAccessToken()
    const baseUrl = process.env.PESAPAL_BASE_URL!
    const ipnId = process.env.PESAPAL_IPN_ID

    if (!ipnId) {
        throw new Error("[PESAPAL] Missing PESAPAL_IPN_ID. Register IPN URL first via /api/pesapal/register-ipn")
    }

    console.log("[PESAPAL] Submitting order:", params.merchantReference, "Amount:", params.amount, params.currency)

    const requestBody = {
        id: params.merchantReference,
        currency: params.currency,
        amount: params.amount,
        description: params.description,
        callback_url: params.callbackUrl,
        redirect_mode: "",
        notification_id: ipnId,
        billing_address: {
            email_address: params.customerEmail,
            first_name: params.customerFirstName || "",
            last_name: params.customerLastName || "",
            phone_number: params.customerPhone || "",
            country_code: "",
            line_1: "",
            line_2: "",
            city: "",
            state: "",
            postal_code: "",
            zip_code: "",
        },
    }

    const response = await fetch(`${baseUrl}/api/Transactions/SubmitOrderRequest`, {
        method: "POST",
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
        const errorText = await response.text()
        console.error("[PESAPAL] Order submission failed:", response.status, errorText)
        throw new Error(`[PESAPAL] Order submission failed: ${response.status}`)
    }

    const data = await response.json()

    if (data.error) {
        console.error("[PESAPAL] Order error:", data.error)
        throw new Error(`[PESAPAL] Order error: ${JSON.stringify(data.error)}`)
    }

    console.log("[PESAPAL] Order created. Tracking ID:", data.order_tracking_id)

    return data
}

// ─── Get Transaction Status ──────────────────────────────────────────────────

interface TransactionStatusResponse {
    payment_method: string
    amount: number
    created_date: string
    confirmation_code: string
    payment_status_description: string // "Completed" | "Failed" | "Reversed" | "Invalid"
    description: string
    message: string
    payment_account: string
    call_back_url: string
    status_code: number // 0=Invalid, 1=Completed, 2=Failed, 3=Reversed
    merchant_reference: string
    currency: string
    error: {
        error_type: string | null
        code: string | null
        message: string | null
    }
    status: string
}

/**
 * Query Pesapal for the status of a transaction.
 *
 * Status codes:
 *   0 = Invalid
 *   1 = Completed
 *   2 = Failed
 *   3 = Reversed
 */
export async function getTransactionStatus(orderTrackingId: string): Promise<TransactionStatusResponse> {
    const token = await getAccessToken()
    const baseUrl = process.env.PESAPAL_BASE_URL!

    console.log("[PESAPAL] Querying transaction status for:", orderTrackingId)

    const response = await fetch(
        `${baseUrl}/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`,
        {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
            },
        }
    )

    if (!response.ok) {
        const errorText = await response.text()
        console.error("[PESAPAL] Status query failed:", response.status, errorText)
        throw new Error(`[PESAPAL] Status query failed: ${response.status}`)
    }

    const data = await response.json()
    console.log("[PESAPAL] Transaction status:", data.payment_status_description, "Code:", data.status_code)

    return data
}

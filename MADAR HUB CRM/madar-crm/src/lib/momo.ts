/**
 * MTN MoMo Collections API (Open API) server utility.
 *
 * Unlike Pesapal, MoMo is not a hosted redirect: `requestToPay` pushes a PIN
 * prompt to the customer's handset and returns immediately with 202 Accepted.
 * The result is only learned by polling `getRequestToPayStatus`, so every
 * caller of this module has to treat "PENDING" as the normal first answer.
 *
 * Environment variables required:
 *   MOMO_BASE_URL              sandbox: https://sandbox.momodeveloper.mtn.com
 *                              live:    https://proxy.momoapi.mtn.com
 *   MOMO_SUBSCRIPTION_KEY      "Primary key" of the Collections subscription
 *   MOMO_API_USER              API user UUID
 *   MOMO_API_KEY               API key generated for that user
 *   MOMO_TARGET_ENVIRONMENT    "sandbox" or, in Rwanda production, "mtnrwanda"
 *
 * Optional:
 *   MOMO_CURRENCY              overrides the currency sent to MTN
 *   MOMO_CALLBACK_URL          sent as X-Callback-Url; polling still decides
 */

import { randomUUID } from "crypto"

const COLLECTION_PATH = "/collection"

// ─── Configuration ───────────────────────────────────────────────────────────

export type MomoConfig = {
    baseUrl: string
    subscriptionKey: string
    apiUser: string
    apiKey: string
    targetEnvironment: string
    currency: string
}

/**
 * MTN's sandbox rejects every currency except EUR, so a sandbox order has to be
 * priced in EUR even though the package is sold in RWF. Production takes the
 * real currency. Deriving it from the target environment means a deployment
 * cannot half-switch and start sending sandbox currency to the live API.
 */
export function momoCurrency(targetEnvironment: string): string {
    if (process.env.MOMO_CURRENCY) return process.env.MOMO_CURRENCY
    return targetEnvironment === "sandbox" ? "EUR" : "RWF"
}

/** Throws with the names of whatever is missing, so a 503 can say why. */
export function getMomoConfig(): MomoConfig {
    const baseUrl = process.env.MOMO_BASE_URL
    const subscriptionKey = process.env.MOMO_SUBSCRIPTION_KEY
    const apiUser = process.env.MOMO_API_USER
    const apiKey = process.env.MOMO_API_KEY
    const targetEnvironment = process.env.MOMO_TARGET_ENVIRONMENT

    const missing: string[] = []
    if (!baseUrl) missing.push("MOMO_BASE_URL")
    if (!subscriptionKey) missing.push("MOMO_SUBSCRIPTION_KEY")
    if (!apiUser) missing.push("MOMO_API_USER")
    if (!apiKey) missing.push("MOMO_API_KEY")
    if (!targetEnvironment) missing.push("MOMO_TARGET_ENVIRONMENT")

    if (missing.length) {
        throw new Error(`[MOMO] Missing environment variables: ${missing.join(", ")}`)
    }

    return {
        baseUrl: baseUrl!.replace(/\/+$/, ""),
        subscriptionKey: subscriptionKey!,
        apiUser: apiUser!,
        apiKey: apiKey!,
        targetEnvironment: targetEnvironment!,
        currency: momoCurrency(targetEnvironment!),
    }
}

/** True when every MoMo variable is present. */
export function isMomoConfigured(): boolean {
    try {
        getMomoConfig()
        return true
    } catch {
        return false
    }
}

/**
 * Whether MoMo may be offered to a paying customer.
 *
 * Being configured is not enough. Sandbox credentials answer requests happily
 * but move no money, so a checkout pointed at the sandbox would take a real
 * customer through a payment that silently does nothing. The option therefore
 * stays hidden until the target environment is a live one — the public site
 * and the portal both ask this before showing the button, so going live is a
 * matter of swapping the env vars and restarting, with no redeploy.
 *
 * Set MOMO_ALLOW_SANDBOX_CHECKOUT=true to exercise the whole flow against the
 * sandbox before production credentials arrive.
 */
export function isMomoLive(): boolean {
    if (!isMomoConfigured()) return false
    if (process.env.MOMO_TARGET_ENVIRONMENT !== "sandbox") return true
    return process.env.MOMO_ALLOW_SANDBOX_CHECKOUT === "true"
}

// ─── In-memory token cache ───────────────────────────────────────────────────

let cachedToken: string | null = null
let tokenExpiry = 0

/**
 * Get a Collections access token, cached in memory.
 * MTN issues these for 3600s; we refresh 60s early.
 */
export async function getAccessToken(config = getMomoConfig()): Promise<string> {
    if (cachedToken && Date.now() < tokenExpiry - 60_000) return cachedToken

    const basic = Buffer.from(`${config.apiUser}:${config.apiKey}`).toString("base64")

    const response = await fetch(`${config.baseUrl}${COLLECTION_PATH}/token/`, {
        method: "POST",
        headers: {
            Authorization: `Basic ${basic}`,
            "Ocp-Apim-Subscription-Key": config.subscriptionKey,
            "Content-Length": "0",
        },
    })

    if (!response.ok) {
        const errorText = await response.text()
        console.error("[MOMO] Token request failed:", response.status, errorText)
        throw new Error(`[MOMO] Failed to get access token: ${response.status}`)
    }

    const data = (await response.json()) as { access_token: string; expires_in: number }
    cachedToken = data.access_token
    tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000

    return cachedToken
}

// ─── Request To Pay ──────────────────────────────────────────────────────────

export type RequestToPayParams = {
    /** Our own reference, echoed back by MTN as externalId. */
    externalId: string
    /** Whole units, in the currency the config resolves to. */
    amount: number
    /** International digits, no plus: 250788123456. */
    payerPhone: string
    /** Shown on the customer's handset prompt. */
    payerMessage: string
    payeeNote: string
}

/**
 * Push a payment prompt to the customer's phone.
 *
 * Returns the MoMo reference id, which is the ONLY handle for the transaction
 * afterwards — it must be persisted before this result is acted on, or the
 * payment becomes unpollable. MTN answers 202 with an empty body; a 202 means
 * the prompt was accepted, never that it was paid.
 */
export async function requestToPay(params: RequestToPayParams): Promise<string> {
    const config = getMomoConfig()
    const token = await getAccessToken(config)
    const referenceId = randomUUID()

    const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        "X-Reference-Id": referenceId,
        "X-Target-Environment": config.targetEnvironment,
        "Ocp-Apim-Subscription-Key": config.subscriptionKey,
        "Content-Type": "application/json",
    }

    const callbackUrl = process.env.MOMO_CALLBACK_URL
    if (callbackUrl) headers["X-Callback-Url"] = callbackUrl

    console.log("[MOMO] RequestToPay:", params.externalId, params.amount, config.currency)

    const response = await fetch(`${config.baseUrl}${COLLECTION_PATH}/v1_0/requesttopay`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            amount: String(params.amount),
            currency: config.currency,
            externalId: params.externalId,
            payer: { partyIdType: "MSISDN", partyId: params.payerPhone },
            payerMessage: params.payerMessage.slice(0, 160),
            payeeNote: params.payeeNote.slice(0, 160),
        }),
    })

    if (response.status !== 202) {
        const errorText = await response.text()
        console.error("[MOMO] RequestToPay failed:", response.status, errorText)
        throw new Error(`[MOMO] RequestToPay failed: ${response.status}`)
    }

    console.log("[MOMO] Prompt sent. Reference:", referenceId)
    return referenceId
}

// ─── Transaction status ──────────────────────────────────────────────────────

export type MomoStatus = "PENDING" | "SUCCESSFUL" | "FAILED"

export type RequestToPayStatus = {
    amount: string
    currency: string
    externalId: string
    financialTransactionId?: string
    payer: { partyIdType: string; partyId: string }
    status: MomoStatus
    reason?: string | { code?: string; message?: string }
}

/**
 * Poll a prompt's outcome.
 *
 * A non-200 (including the 404 MTN returns for a reference it has no record of)
 * throws rather than reporting failure, because the safe reading of "unknown"
 * is "do not resolve the payment yet" — the reconcile sweep ages it out.
 */
export async function getRequestToPayStatus(referenceId: string): Promise<RequestToPayStatus> {
    const config = getMomoConfig()
    const token = await getAccessToken(config)

    const response = await fetch(`${config.baseUrl}${COLLECTION_PATH}/v1_0/requesttopay/${referenceId}`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`,
            "X-Target-Environment": config.targetEnvironment,
            "Ocp-Apim-Subscription-Key": config.subscriptionKey,
        },
    })

    if (!response.ok) {
        const errorText = await response.text()
        console.error("[MOMO] Status query failed:", response.status, errorText)
        throw new Error(`[MOMO] Status query failed: ${response.status}`)
    }

    const data = (await response.json()) as RequestToPayStatus
    console.log("[MOMO] Status for", referenceId, "=", data.status)
    return data
}

/** MTN returns `reason` as either a bare string or an object; flatten it for logs. */
export function describeMomoReason(reason: RequestToPayStatus["reason"]): string | null {
    if (!reason) return null
    if (typeof reason === "string") return reason
    return reason.message || reason.code || null
}

// ─── Sandbox provisioning ────────────────────────────────────────────────────

/**
 * Create a sandbox API user and key.
 *
 * Only meaningful against sandbox.momodeveloper.mtn.com — in production MTN
 * issues these to you directly and this endpoint does not exist. Exposed so the
 * values for MOMO_API_USER / MOMO_API_KEY can be generated without a
 * hand-written curl.
 */
export async function provisionSandboxApiUser(providerCallbackHost: string) {
    const baseUrl = (process.env.MOMO_BASE_URL || "").replace(/\/+$/, "")
    const subscriptionKey = process.env.MOMO_SUBSCRIPTION_KEY

    if (!baseUrl || !subscriptionKey) {
        throw new Error("[MOMO] MOMO_BASE_URL and MOMO_SUBSCRIPTION_KEY must be set before provisioning")
    }

    const apiUser = randomUUID()

    const createResponse = await fetch(`${baseUrl}/v1_0/apiuser`, {
        method: "POST",
        headers: {
            "X-Reference-Id": apiUser,
            "Ocp-Apim-Subscription-Key": subscriptionKey,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ providerCallbackHost }),
    })

    if (createResponse.status !== 201) {
        const errorText = await createResponse.text()
        throw new Error(`[MOMO] Could not create sandbox API user: ${createResponse.status} ${errorText}`)
    }

    const keyResponse = await fetch(`${baseUrl}/v1_0/apiuser/${apiUser}/apikey`, {
        method: "POST",
        headers: {
            "Ocp-Apim-Subscription-Key": subscriptionKey,
            "Content-Length": "0",
        },
    })

    if (keyResponse.status !== 201) {
        const errorText = await keyResponse.text()
        throw new Error(`[MOMO] Could not create sandbox API key: ${keyResponse.status} ${errorText}`)
    }

    const { apiKey } = (await keyResponse.json()) as { apiKey: string }
    return { apiUser, apiKey }
}

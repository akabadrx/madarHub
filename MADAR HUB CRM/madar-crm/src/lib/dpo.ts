/**
 * DPO Pay (3G Direct Pay) API v6 Server Utility
 *
 * A hosted redirect, like Pesapal: createToken registers the transaction and
 * returns a TransToken, the customer pays on DPO's page, and verifyToken is
 * the only thing that says whether money moved. The API is XML over a single
 * POST endpoint. All calls are server-side only.
 *
 * Environment Variables Required:
 *   DPO_BASE_URL        https://secure.3gdirectpay.com (test and live share it)
 *   DPO_COMPANY_TOKEN   the company token from DPO
 *   DPO_SERVICE_TYPE    the service ID from DPO
 *   DPO_MODE            "test" or "live" — see isDpoLive
 */

import { normalizePhone } from "@/lib/utils"

type DpoConfig = {
    baseUrl: string
    companyToken: string
    serviceType: string
    mode: "test" | "live"
}

/** Throws with the names of whatever is missing, so a 503 can say why. */
export function getDpoConfig(): DpoConfig {
    const baseUrl = process.env.DPO_BASE_URL
    const companyToken = process.env.DPO_COMPANY_TOKEN
    const serviceType = process.env.DPO_SERVICE_TYPE
    const mode = process.env.DPO_MODE

    const missing: string[] = []
    if (!baseUrl) missing.push("DPO_BASE_URL")
    if (!companyToken) missing.push("DPO_COMPANY_TOKEN")
    if (!serviceType) missing.push("DPO_SERVICE_TYPE")
    if (mode !== "test" && mode !== "live") missing.push('DPO_MODE ("test" or "live")')

    if (missing.length) {
        throw new Error(`[DPO] Missing environment variables: ${missing.join(", ")}`)
    }

    return {
        baseUrl: baseUrl!.replace(/\/+$/, ""),
        companyToken: companyToken!,
        serviceType: serviceType!,
        mode: mode as "test" | "live",
    }
}

/** True when every DPO variable is present. */
export function isDpoConfigured(): boolean {
    try {
        getDpoConfig()
        return true
    } catch {
        return false
    }
}

/** Whether new transactions are being created against a test-mode account. */
export function isDpoTestMode(): boolean {
    return process.env.DPO_MODE !== "live"
}

/**
 * Whether DPO may be offered to a paying customer.
 *
 * Unlike MoMo, nothing in the URL gives a test account away: DPO's test and
 * live credentials talk to the same host, and only DPO knows which a company
 * token is. DPO_MODE is therefore the switch, and it has to say "live" before
 * the public site or the portal shows the option. Going live is swapping the
 * token and service ID for the live ones, setting DPO_MODE="live" and
 * restarting — no redeploy.
 *
 * DPO_ALLOW_TEST_CHECKOUT=true opens the flow in test mode, but ONLY ever
 * against a throwaway database. DPO's test cards complete without moving any
 * money, so fulfilment would book real Payment rows against real Leads for
 * payments that never happened — for any customer on the pricing page at the
 * time. Never set it on the production deployment.
 */
export function isDpoLive(): boolean {
    if (!isDpoConfigured()) return false
    if (!isDpoTestMode()) return true
    return process.env.DPO_ALLOW_TEST_CHECKOUT === "true"
}

/** The hosted page a customer is sent to for a given TransToken. */
export function dpoPaymentUrl(transToken: string, config = getDpoConfig()): string {
    return `${config.baseUrl}/payv2.php?ID=${encodeURIComponent(transToken)}`
}

// ─── XML plumbing ────────────────────────────────────────────────────────────

function escapeXml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;")
}

function unescapeXml(value: string): string {
    return value
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&")
}

/**
 * Reads one flat tag out of a DPO response. The responses are a single level of
 * scalar tags under <API3G>, so a parser dependency would buy nothing.
 */
export function readTag(xml: string, tag: string): string | null {
    const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
    if (!match) return null
    const value = match[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1").trim()
    return unescapeXml(value)
}

/** Builds child elements from a record, skipping empty values. */
function elements(fields: Record<string, string | number | null | undefined>): string {
    return Object.entries(fields)
        .filter(([, value]) => value !== null && value !== undefined && value !== "")
        .map(([tag, value]) => `<${tag}>${escapeXml(String(value))}</${tag}>`)
        .join("")
}

async function postXml(body: string, config: DpoConfig): Promise<string> {
    const response = await fetch(`${config.baseUrl}/API/v6/`, {
        method: "POST",
        headers: { "Content-Type": "application/xml", Accept: "application/xml" },
        body: `<?xml version="1.0" encoding="utf-8"?><API3G>${body}</API3G>`,
        cache: "no-store",
    })

    const text = await response.text()
    if (!response.ok) {
        console.error("[DPO] Request failed:", response.status, text.slice(0, 500))
        throw new Error(`[DPO] Request failed: ${response.status}`)
    }
    return text
}

/** DPO's ServiceDate format: "YYYY/MM/DD HH:MM", in Kigali time. */
function serviceDate(date = new Date()): string {
    const kigali = new Date(date.getTime() + 2 * 3_600_000)
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${kigali.getUTCFullYear()}/${pad(kigali.getUTCMonth() + 1)}/${pad(kigali.getUTCDate())} ${pad(kigali.getUTCHours())}:${pad(kigali.getUTCMinutes())}`
}

// ─── Create Token ────────────────────────────────────────────────────────────

interface CreateTokenParams {
    merchantReference: string
    amount: number
    currency: string
    description: string
    /** Where DPO sends the customer after paying; DPO appends its own query. */
    redirectUrl: string
    /** Where DPO's "Cancel" / back link goes. */
    backUrl: string
    customerEmail: string
    customerFirstName?: string
    customerLastName?: string
    customerPhone?: string
}

interface CreateTokenResult {
    transToken: string
    transRef: string | null
}

/**
 * How long the customer has to pay on DPO's page. Past it DPO reports 903 and
 * the transaction can no longer be paid, so the reconcile sweep can retire the
 * row instead of polling it for a day.
 */
const PAYMENT_TIME_LIMIT_MINUTES = 60

/**
 * Registers a transaction with DPO.
 * Returns the TransToken the customer is sent to pay with.
 */
export async function createToken(params: CreateTokenParams): Promise<CreateTokenResult> {
    const config = getDpoConfig()

    console.log("[DPO] Creating token:", params.merchantReference, "Amount:", params.amount, params.currency)

    // As with Pesapal, DPO uses the phone to offer the right mobile-money
    // network, so a Rwandan number goes as its local part plus the country.
    // Anything else is left off rather than sent in a shape DPO may reject.
    const phone = params.customerPhone ? normalizePhone(params.customerPhone) : ""
    const rwandan = /^250\d{9}$/.test(phone)

    const transaction = elements({
        // RWF has no minor unit; DPO still expects a decimal amount.
        PaymentAmount: params.amount.toFixed(2),
        PaymentCurrency: params.currency,
        CompanyRef: params.merchantReference,
        RedirectURL: params.redirectUrl,
        BackURL: params.backUrl,
        // Refuse a second transaction under the same reference, so a retried
        // request can never open two payable tokens for one order.
        CompanyRefUnique: 1,
        PTL: PAYMENT_TIME_LIMIT_MINUTES,
        PTLtype: "minutes",
        customerEmail: params.customerEmail,
        customerFirstName: params.customerFirstName,
        customerLastName: params.customerLastName,
        customerPhone: rwandan ? phone.slice(3) : null,
        customerDialCode: rwandan ? "RW" : null,
        customerCountry: rwandan ? "RW" : null,
    })

    const service = elements({
        ServiceType: config.serviceType,
        ServiceDescription: params.description,
        ServiceDate: serviceDate(),
    })

    const xml = await postXml(
        `${elements({ CompanyToken: config.companyToken, Request: "createToken" })}` +
            `<Transaction>${transaction}</Transaction>` +
            `<Services><Service>${service}</Service></Services>`,
        config,
    )

    const result = readTag(xml, "Result")
    const explanation = readTag(xml, "ResultExplanation")
    const transToken = readTag(xml, "TransToken")

    if (result !== "000" || !transToken) {
        console.error("[DPO] createToken refused:", result, explanation)
        throw new Error(`[DPO] createToken refused: ${result ?? "no result"} ${explanation ?? ""}`.trim())
    }

    console.log("[DPO] Token created for", params.merchantReference)

    return { transToken, transRef: readTag(xml, "TransRef") }
}

// ─── Verify Token ────────────────────────────────────────────────────────────

export type DpoOutcome = "PAID" | "PENDING" | "FAILED"

export interface VerifyTokenResult {
    outcome: DpoOutcome
    /** DPO's result code, e.g. "000" paid, "900" not paid yet, "901" declined. */
    code: string
    explanation: string | null
    amount: number | null
    currency: string | null
    companyRef: string | null
}

/**
 * Result codes that settle a transaction one way or the other. Anything not
 * listed — 900 not paid yet, 001 authorised but not captured, 002 over- or
 * underpaid, 003/005/007 still with the bank — is left PENDING: a later check,
 * or staff, decide it. Reporting those as FAILED would tell a customer whose
 * money may still land that it did not.
 */
const FAILED_CODES: Record<string, string> = {
    "901": "Declined",
    "903": "Payment time limit passed",
    "904": "Cancelled",
}

/** Codes that mean the request itself was wrong, not the payment. */
const REQUEST_ERROR_CODES = new Set(["801", "802", "803", "804", "902", "950"])

/**
 * Asks DPO whether a transaction was paid.
 */
export async function verifyToken(transToken: string): Promise<VerifyTokenResult> {
    const config = getDpoConfig()

    const xml = await postXml(
        elements({ CompanyToken: config.companyToken, Request: "verifyToken", TransactionToken: transToken }),
        config,
    )

    const code = readTag(xml, "Result") ?? ""
    const explanation = readTag(xml, "ResultExplanation")

    if (REQUEST_ERROR_CODES.has(code) || !code) {
        console.error("[DPO] verifyToken refused:", code, explanation)
        throw new Error(`[DPO] verifyToken refused: ${code || "no result"} ${explanation ?? ""}`.trim())
    }

    const amountText = readTag(xml, "TransactionAmount")
    const amount = amountText !== null && amountText !== "" ? Number(amountText) : null

    const outcome: DpoOutcome = code === "000" ? "PAID" : code in FAILED_CODES ? "FAILED" : "PENDING"

    console.log("[DPO] Transaction status:", code, explanation)

    return {
        outcome,
        code,
        explanation: FAILED_CODES[code] ?? explanation,
        amount: amount !== null && Number.isFinite(amount) ? amount : null,
        currency: readTag(xml, "TransactionCurrency"),
        companyRef: readTag(xml, "CompanyRef"),
    }
}

// ─── Cancel Token ────────────────────────────────────────────────────────────

/**
 * Cancels an unpaid transaction so its token can no longer be paid. Used by the
 * credential check, which opens a transaction only to prove the keys work.
 */
export async function cancelToken(transToken: string): Promise<void> {
    const config = getDpoConfig()

    const xml = await postXml(
        elements({ CompanyToken: config.companyToken, Request: "cancelToken", TransactionToken: transToken }),
        config,
    )

    const code = readTag(xml, "Result")
    if (code !== "000") {
        throw new Error(`[DPO] cancelToken refused: ${code ?? "no result"} ${readTag(xml, "ResultExplanation") ?? ""}`.trim())
    }
}

/**
 * Proves the DPO credentials in .env work, without a checkout and without
 * touching the database.
 *
 *   npm run dpo:check
 *
 * Opens a 100 RWF transaction, asks DPO for its status (it should be "not paid
 * yet"), then cancels it so the token can never be paid. Safe against both the
 * test and the live account: nothing is charged and no CRM rows are written.
 */

import { cancelToken, createToken, dpoPaymentUrl, getDpoConfig, verifyToken } from "../src/lib/dpo"

async function main() {
    try {
        process.loadEnvFile(".env")
    } catch {
        // Already in the environment, e.g. on the server under pm2.
    }

    const config = getDpoConfig()
    console.log(`DPO ${config.mode} account, service ${config.serviceType}, ${config.baseUrl}`)

    const reference = `MHCHECK-${Date.now()}`
    const { transToken } = await createToken({
        merchantReference: reference,
        amount: 100,
        currency: "RWF",
        description: "Madar Hub - credential check",
        redirectUrl: "https://madarorbit.com/payment-success.html",
        backUrl: "https://madarorbit.com/payment-failed.html",
        customerEmail: "noreply@madarorbit.com",
        customerFirstName: "Credential",
        customerLastName: "Check",
    })
    console.log("createToken OK  ", reference)
    console.log("payment page    ", dpoPaymentUrl(transToken, config))

    const status = await verifyToken(transToken)
    console.log("verifyToken OK  ", status.code, status.explanation, `${status.amount ?? "?"} ${status.currency ?? ""}`.trim())

    await cancelToken(transToken)
    console.log("cancelToken OK  ", "the check transaction can no longer be paid")
}

main().catch((error) => {
    console.error("DPO check FAILED:", error instanceof Error ? error.message : error)
    process.exit(1)
})

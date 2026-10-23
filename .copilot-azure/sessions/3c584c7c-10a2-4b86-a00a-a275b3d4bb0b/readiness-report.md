# Casaio readiness evaluation

## Summary

**Ready with caveats for basic storefront startup; not complete as a verified, real-time, automated dropshipping business.** The codebase contains substantial customer, seller, admin, catalog, checkout, and payment functionality. The current local configuration is missing required Razorpay mode selectors, several footer links have no corresponding pages, and the code does not show realtime catalog/order subscriptions or automated supplier fulfillment.

For Azure specifically, the core Firebase SDK usage is a **major migration blocker**. This does not prevent the current Firebase-backed application from running on a compatible Node.js host. No Azure deployment configuration was found, and Azure CLI is not installed in the current environment.

| Axis | Verdict | Assessment |
|---|---|---|
| Build | PASS (static only) | `package.json`, `package-lock.json`, and Next.js `dev`, `build`, and `start` scripts exist. No missing package imports were found in config files and the first 20 source files checked. A build was not run. |
| Completeness | WARN | Main store, account, seller, admin, checkout, order, and payment surfaces exist, but payment configuration and several business-facing routes/workflows are incomplete. |
| Deployability | WARN | A standard Node.js start path exists. Azure-native deployment requires resolving the Firebase migration; there is no Dockerfile, Azure IaC, or health endpoint. |

## What is present

- Next.js 16.4.2, TypeScript, and React 19 application with `dev`, `build`, and `start` scripts.
- Customer storefront, product/category pages, cart, account, seller portal, admin portal, and API routes for orders, catalog, reviews, seller operations, and payments.
- Firebase Authentication, Firestore, and Storage configuration, Firestore indexes/rules, and Storage rules.
- Razorpay checkout, payment verification, webhook handling, payment recovery/reconciliation, and COD support are represented in code.
- Seller fulfillment can record milestones and manually entered carrier/tracking details.
- README has local setup and Firebase/Razorpay configuration guidance; test files and a rules-emulator script are present.

## Findings

### Major migration blocker — Azure only

The application uses `firebase` and `firebase-admin` for core auth, database, and storage operations. The Azure migration mapping is:

- Firebase Authentication → Microsoft Entra ID / Entra External ID
- Firestore → Azure Cosmos DB
- Firebase Storage → Azure Blob Storage
- Firebase serverless handlers, where applicable → Azure Functions

The user chose to continue the evaluation despite this dependency. Per the readiness workflow, Azure planning must stop here until the Firebase services are migrated or the Azure migration is explicitly redirected.

### Warnings

1. **Online payment configuration is incomplete in the checked local environment.** `RAZORPAY_MODE`, `RAZORPAY_KEY_SECRET_MODE`, and `RAZORPAY_WEBHOOK_SECRET_MODE` are absent from `.env.local` and the current process environment. The application requires explicit matching modes; Razorpay payment setup/webhook requests will fail configuration validation until these are set. Secret values were not displayed or validated.
2. **Footer links point to missing pages.** `/shipping-policy`, `/returns-refunds`, `/faq`, `/contact`, `/seller/guidelines`, and `/seller/dropship-faq` have no route files in the app tree. These links will lead to not-found pages.
3. **The app is not realtime for catalog/order/shipment updates.** No Firestore `onSnapshot` listener was found. Product pages revalidate at 60-second intervals, and checkout payment status is polled every 15 seconds; that is not immediate push-based inventory or order tracking.
4. **Dropship fulfillment is manual, not supplier-automated.** Sellers can submit carrier, tracking, and status details, but no supplier feed/order-forwarding or carrier tracking API integration was detected. It can operate as a manually managed multi-seller marketplace if that workflow is intended.
5. **The sample Firebase project does not match the CLI default.** `.env.example` uses a sample project identifier different from `.firebaserc`. The current `.env.local` project identifiers were checked and match the CLI default, but a fresh setup copied from the sample could deploy rules to one project while the app points to another.
6. **The supported Node.js version is not declared.** The current local runtime is Node.js 22.16.0, but `package.json` has no `engines` field; set the hosting runtime explicitly.
7. **No dedicated health endpoint exists.** This does not prevent local startup, but hosting health probes need a valid route or a new lightweight endpoint.

## Azure/deployment notes

- No `azure.yaml`, Dockerfile, `.dockerignore`, Terraform, Bicep, or GitHub Actions workflow was detected.
- Azure CLI is not installed in the current environment; no Azure account/deployment context could be checked.
- The 582,974-byte lockfile and Next build-time compilation make Azure App Service F1 unsuitable under the readiness heuristics. `node-gyp` appears under optional dev-only `re2`; the local runtime is Node.js 22.16.0.
- Firebase project values and secret values were not exposed. Variable presence alone does not verify that credentials are valid or that live services are reachable.

## Validation limits and next steps

This was a static review only. No install, build, lint, or test commands were run, and no live Firebase, Razorpay, supplier, or carrier services were contacted. The app's real data, deployment credentials, webhook delivery, and live purchase lifecycle remain unverified.

Before launch:

1. Configure Razorpay test-mode and webhook-mode variables, then verify a sandbox payment and webhook end to end.
2. Implement the linked shipping/returns/support/seller-guidance pages or remove the dead links.
3. Decide whether manual seller fulfillment is acceptable. If the requirement is automated dropshipping, integrate the selected supplier and carrier APIs.
4. Decide what “real-time” means for the product: add push subscriptions or a documented update interval for inventory and order milestones.
5. Align `.env.example` with the intended Firebase project configuration.
6. Choose hosting. If Azure is required, plan the Firebase-to-Azure migration before preparing infrastructure.

Full structured findings: [`prereq-output.json`](./prereq-output.json). Session context: [`context.json`](./context.json).

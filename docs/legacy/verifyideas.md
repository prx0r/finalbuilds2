# VerificationEnvelope — Cryptographic Verification Architecture

## Core Rule

> An LLM should never have to trust Dell2's word that something is verified. Dell2 should return an object that software can independently verify.

## Research Context

Citations alone are weak. In *Cited but Not Verified*, frontier systems had link validity >94%, yet factual support of cited claims was only ~39-77%. ProvenanceGuard finds that which source supports which exact claim is an independent verification problem.

## Verification Layer Stack

| Layer | Technology | What it proves | Priority |
|-------|-----------|----------------|----------|
| Claim semantics | atomic claims / evidence DAG / ProvenanceGuard / VeriGraph | Exactly what proposition is asserted and what evidence supports it | Mandatory |
| Web-origin proof | TLSNotary | Disclosed content genuinely came from claimed HTTPS server | Very important |
| Artifact integrity | SHA-256 / Trusty URI | Evidence hasn't changed | Mandatory |
| Verifier provenance | SLSA / Sigstore | Which exact verifier code generated the result | Important |
| Runtime attestation | TEE + EAT/RATS | Expected verifier code actually executed in attested environment | Frontier/optional |
| Claim credential | W3C VC 2.0 | Machine-verifiable signed assertion | Strong compatibility layer |
| Immutable publication | SCITT / Rekor | Signed assertion publicly registered, hasn't been rewritten | Mandatory eventually |
| Web discoverability | Schema.org ClaimReview + JSON-LD | Crawlers/agents understand "this is a verification of claim X" | Mandatory |
| Agent interface | MCP / REST verifier | Agent can actively verify rather than interpreting prose | Mandatory |

## Architecture

```
         PROVIDER
            │
            │ HTTPS
            ▼
  ┌────────────────────┐
  │ TLSNotary capture  │
  │ or signed HTTP     │
  └─────────┬──────────┘
            │
    authenticated evidence
            │
            ▼
     sha256 artifact
            │
            ▼
  ┌───────────────────────────┐
  │ deterministic Dell verifier│
  │                           │
  │ evidence → atomic claim   │
  │ evidence → price          │
  │ evidence → quota          │
  │ API → service live        │
  └─────────────┬─────────────┘
                │
                ▼
        DealVerification
                │
      ┌─────────┴────────┐
      ▼                  ▼
   W3C VC            JSON-LD /
   signed             ClaimReview
      │
      ▼
  SCITT/Rekor
transparency receipt
      │
      ▼
  PUBLIC CERTIFICATE
      │
┌──────┼──────────────┐
▼      ▼              ▼
website REST        MCP
     endpoint        tool
```

## Agent-Facing Response

An agent asking "is OpenCode Go actually a $10/month 6x deal?" should get:

```json
{
  "claim": { "subject": "opencode.go", "predicate": "renewal_price_usd_month", "value": 10 },
  "verdict": "PROVEN",
  "evidence": {
    "source_origin": "https://opencode.ai",
    "artifact_sha256": "9a83...",
    "tls_attestation": "https://dell.example/proofs/..."
  },
  "verifier": {
    "name": "dell2-opencode-go-v1",
    "source_commit": "3b7f...",
    "container_digest": "sha256:...",
    "slsa_provenance": "..."
  },
  "issued_at": "2026-08-22T...",
  "valid_until": "2026-08-23T...",
  "credential": "...",
  "transparency_receipt": "...",
  "replay": { "endpoint": "/v1/certificates/.../verify" }
}
```

## Key Technologies

### TLSNotary
Cryptographic proof that disclosed content came from an authenticated TLS connection. Supports selective disclosure — login cookies stay hidden while plan/price/quota fields are revealed.

### Atomic Claims + Evidence DAGs
Claim-level provenance rather than "here are some sources." VeriGraph reported 87.61% grounding rate under claim-level evaluation.

### Nanopublications
Three explicit graphs: ASSERTION (what is claimed), PROVENANCE (where/how), PUBLICATION INFO (who/when). Trusty URIs incorporate integrity hash.

### W3C VC 2.0
Standard format for "Dell2 attests that claim C passed verification procedure P using evidence E." Note: VC doesn't mean Dell is trustworthy — the evidence/proof chain beneath is what matters.

### SCITT (RFC 9943)
Signed Statement → Transparency Service → Receipt → Relying Party verification. Prevents quiet certificate modification.

### Sigstore/Rekor (day-one implementation)
Immutable transparency log with inclusion proofs. Bundle: SHA256 + Sigstore signature + Rekor receipt.

### Verifier Provenance (SLSA)
Bind every certificate to exact verifier: git commit, container digest, test suite, build provenance.

### TEE Attestation (frontier)
AMD SEV-SNP/Intel TDX confidential VMs with EAT (RFC 9711) for hardware-rooted trust.

## VerificationEnvelope (canonical format)

```json
{
  "schema": "https://dell.example/schema/verification-envelope/v1",
  "claim": {...},
  "scope": { "region": "GB", "customer_type": "individual" },
  "evidence": [{ "digest": "sha256:...", "source": "...", "tlsnotary": {...} }],
  "provenance": { "derived_from": ["sha256:..."] },
  "verifier": { "source_commit": "...", "image_digest": "sha256:...", "slsa": "..." },
  "witnesses": { "endpoint": "PASS", "model_catalog": "PASS", "inference": "NOT_RUN" },
  "credential": { "type": "W3C-VC-2.0", "signature": "..." },
  "transparency": { "backend": "rekor", "receipt": "...", "inclusion_proof": "..." },
  "valid_until": "..."
}
```

## Phased Implementation

### v1 (buildable now)
atomic claims + evidence spans + SHA256 artifacts + provenance DAG + deterministic replay + signed VerificationEnvelope + Sigstore/Rekor + JSON-LD ClaimReview + MCP verify_certificate()

### v1.5
TLSNotary + W3C VC 2.0 + nanopublication/RDF projection + multiple independent watchers

### v2
attested verifier container + EAT + confidential VM/TEE + SCITT-native transparency service

## MCP Interface

```
search_deals()
get_deal()
verify_deal()
get_certificate()
verify_certificate()
get_evidence()
replay_certificate()
```

Critical call: `verify_certificate("sha256:abc...")` returns deterministic pass/fail checks, not prose.

## Product Moat

> "here is the claim; here is the exact evidence; here is cryptographic proof of where the evidence came from; here is the exact verifier that evaluated it; here is its signed result; here is an immutable third-party receipt; **run this command if you don't trust us.**"

## References

1. "Cited but Not Verified" — arXiv:2605.06635
2. "ProvenanceGuard" — arXiv:2606.18037
3. TLSNotary Protocol — tlsnotary.org
4. "From Agent Traces to Trust" — arXiv:2606.04990
5. "VeriGraph" — arXiv:2606.16603
6. Nanopublication Guidelines — nanopub.net
7. W3C VC Data Model v2.0 — w3.org/TR/vc-data-model
8. RFC 9943 SCITT — ietf.org
9. Sigstore/Rekor — docs.sigstore.dev
10. SLSA Provenance — slsa.dev
11. RFC 9711 EAT — ietf.org
12. "When Agents Handle Secrets" — arXiv:2605.03213
13. "AI Agents with DIDs and VCs" — arXiv:2511.02841
14. Schema.org ClaimReview — schema.org
15. "AEX" — arXiv:2603.14283

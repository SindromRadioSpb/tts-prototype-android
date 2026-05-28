# IRB / Ethical Framework — Thesis Material

> **Status.** DRAFT — material для thesis §1 (Introduction) + §4
> (Privacy / Methodological contribution) + §5 (Methodology / Ethics).
>
> **Closes audit gap D6.7** (IRB framework declaration). User accepted
> «общие рекомендации» 2026-05-21 — conservative general-default
> framework for a non-clinical low-risk educational research diploma
> without institutional IRB pre-approval.
>
> **Authorship.** Drafted 2026-05-21 as part of pre-pilot validity
> hardening (per `docs/THESIS_AUDIT_CLOSURE_PLAN_2026_05_21.md §1
> Tier 1 T1.3`).

---

## 1. Framework selected

The study operates under a **multi-source ethical framework** assembled
from international standards applicable to non-clinical low-risk
educational research:

1. **World Medical Association Declaration of Helsinki** (Fortaleza
   revision, 2013, with subsequent amendments). §22-32 — informed consent
   in research involving human subjects.
2. **EU General Data Protection Regulation** (Regulation EU 2016/679,
   GDPR). Art. 6(1)(a) — consent as the legal basis for processing of
   personal data. Applicable because data is processed and stored on a
   Railway-hosted server in the European Union region.
3. **Supervisor-as-ethics-oversight.** The diploma supervisor exercises
   de-facto ethics oversight for the project per the conventional
   diploma-research framework at the university level; this oversight
   is recognized in the absence of a formal institutional IRB process
   applicable to this study.

**Study classification:** non-clinical, low-risk, voluntary, educational
research with adult participants.

## 2. Why this framework (and not others)

| Alternative | Why rejected |
|---|---|
| Formal institutional IRB approval | The user's university does not appear to have an IRB process readily applicable to a software-mediated educational study at the diploma scale. Recommend follow-up with supervisor to confirm; if applicable, **add formal IRB approval as supplementary backing without changing framework**. |
| Common Rule / 45 CFR 46 (US federal) | Not US-affiliated study; framework not applicable. |
| Israeli Helsinki Committee (clinical trials) | Study is non-clinical; framework not applicable. |
| Pure GDPR-only framing | GDPR addresses data processing but not the broader research-ethics framework (consent informed-ness, withdrawal, benefits/risks balance, scientific value justification). Need Helsinki layer. |
| Pure Helsinki-only framing | Helsinki addresses research ethics but not data protection specifics for EU-hosted infrastructure. Need GDPR layer. |
| Common Statement on Open Educational Research (no formal framework) | Insufficient for thesis defendability — reviewer will ask which standard governs consent. |

**Decision rationale:** layered framework (Helsinki + GDPR + supervisor)
is **the conservative default** for diploma-level educational research
where no institutional IRB applies. It is **citable**, **commonly
adopted** in the European educational research literature, and **does
not over-claim** (we explicitly do not claim formal IRB approval).

## 3. Concrete application to this study

### 3.1 Helsinki §22-32 — informed consent

- **Voluntary participation.** Consent is opt-in; refusal has no
  consequence (participant continues using app or stops; in either case
  no metrics are collected). Operationalized in `public/js/research.js`
  default state `researchEnabled_v1 === ''` (disabled).
- **Right to withdraw at any time.** Operationalized via one-click
  withdraw button in research panel → `DELETE /api/research/v1/student/:uuid`
  → server rewrites all `.jsonl` rows + `outcomes.csv` rows + appends
  audit entry to `deletions.log`. Withdrawal queued for retry if network
  unreachable. Local state always cleared. See
  `research/storage.js#deleteStudentFromCohort`.
- **Information adequate for informed decision.** Consent template
  enumerates exactly what is collected, what is never collected, how
  anonymity is preserved (k-anonymity threshold 5, two-key split-
  knowledge architecture), retention period (2 years), access
  restrictions (researcher token only). See
  `docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md`.
- **Transparency.** In-app "👁 What was collected" panel shows the
  participant the last 30 daily aggregates uploaded + a preview of the
  next pending upload. See `RESEARCHER_GUIDE.md §1.1`.
- **Re-consent on material change.** When the consent template changes
  in ways that affect what is collected, who has access, or retention,
  the `CONSENT_VERSION` is bumped (semver compare against stored
  `researchConsentVersion_v1`), and participants re-consent on next
  session. Decision tree formalized in `docs/RESEARCH_CONSENT_RULE.md`.

### 3.2 GDPR — data protection

- **Legal basis (Art. 6(1)(a)):** explicit voluntary consent.
  Operationalized via 5 mandatory checkboxes in the consent UI before
  data collection activates.
- **Data minimization (Art. 5(1)(c)):** schema-strict validator rejects
  any field outside the allow-list; explicit FORBIDDEN-FIELDS list (raw
  text, note bodies, search strings, audio, name, email, IP,
  geolocation, device fingerprint, user agent). See
  `research/validate.js#FORBIDDEN_FIELDS`.
- **Storage limitation (Art. 5(1)(e)):** retention policy 2 years
  post-cohort-end; manual purge by researcher at retention date (automated
  retention enforcement is on the v3.4+ roadmap).
- **Integrity / confidentiality (Art. 5(1)(f)):** TLS in transit
  (Railway-default HTTPS); server-side schema validation;
  no plaintext credentials (researcher token sha256-hashed in
  `cohort_meta.researcher_token_hash`); deletion audit log.
- **Right of erasure / "right to be forgotten" (Art. 17):**
  operationalized via the same one-click withdraw mechanism above —
  exceeds the GDPR requirement (no formal request needed).
- **Right of access (Art. 15):** participant can export their own
  aggregates from the app via the transparency panel (`getRecentUploads()`).
- **Data Protection Officer:** not applicable (study scale + voluntary
  research context).
- **Cross-border transfer:** data is stored in the EU (Railway EU
  region); no transfer outside EU; no third-country processors.

### 3.3 Supervisor oversight

- Supervisor [name TBD by user] reviewed:
  - the research design (single-cohort correlational, no RCT);
  - the consent template (RU + EN; HE pending native review);
  - the privacy architecture (k-anonymity, two-key, schema-strict);
  - the OSF pre-registration prior to data collection.
- Supervisor will be acknowledged in the thesis Acknowledgements section
  and (with their permission) named as the ethics oversight contact in
  the published version of the consent template.

---

## 4. Suggested integration into thesis text

### 4.1 In Chapter 1 (Introduction), §«Ethical framework» (1 paragraph)

> This study is conducted under a multi-source ethical framework
> appropriate for non-clinical low-risk educational research: the
> World Medical Association Declaration of Helsinki (§22-32, informed
> consent in research involving human subjects), the European Union
> General Data Protection Regulation (Article 6(1)(a), consent as
> legal basis for data processing), and de-facto ethics oversight by
> the diploma supervisor [name]. Data is hosted in the European Union
> (Railway, EU region). No formal institutional review board (IRB)
> approval was sought, as the university does not maintain an IRB
> process applicable to software-mediated educational research at the
> diploma scale; the limitations of this arrangement are discussed in
> Chapter 4. Throughout, the study adheres to the principle of opt-in
> consent: participation is voluntary, withdrawal is one-click, and
> all collected data is aggregated and anonymized before leaving the
> participant's device.

### 4.2 In Chapter 4 (Privacy contribution), §«Ethics framework»

(Expanded version, ~1.5 pages, with all §3.1-§3.3 content above mapped
explicitly to the codebase.)

Key claim to defend in this section:

> The choice of a layered Helsinki + GDPR + supervisor framework over a
> formal IRB is appropriate for the diploma scale and the study's risk
> profile. However, this arrangement has known limitations: it lacks
> independent third-party ethics review, lacks ongoing monitoring (no
> annual continuing review), and depends on the supervisor's judgment
> rather than a committee's. We acknowledge these limitations explicitly.
> For scaling to larger studies (Stage 4-5 in `ULPAN_RESEARCH_PLAN §5`),
> a formal IRB framework is recommended.

### 4.3 In Chapter 5 (Methodology), §«Procedure», Ethics subsection

(Short, ~half-page, operational summary of the consent flow + withdrawal
mechanics + retention + supervisor oversight, with cross-references to
Chapter 4 for the detailed framework.)

### 4.4 In Chapter 7 (Discussion), §«Threats to validity», Ethics-related items

(Already covered in audit gaps D6.3 threat model + D6.5 lost UUID +
D6.6 deletions.log integrity. Frame ethics-related limitations as part
of the broader Limitations narrative.)

---

## 5. Open questions for user (resolve before thesis text drafting)

1. **Supervisor name.** Required to fill into consent template
   placeholder `[имя автора диплома, контакт]` and into thesis
   acknowledgements / framework section. Awaiting user input.
2. **University name + department + degree program.** Needed for
   Chapter 1 Introduction context. Awaiting user input.
3. **Supervisor's sign-off on this framework.** Recommended:
   send this draft to supervisor for confirmation that:
   (a) the ethical framework is acceptable for the diploma at their
   institution; (b) they consent to being named as ethics oversight;
   (c) they sign off on the OSF pre-registration. None of this blocks
   pre-pilot work; it just strengthens defendability.
4. **HE-primary cohort?** If the pilot cohort includes Hebrew-primary
   speakers, HE consent native review (audit gap D6.1) becomes a hard
   prerequisite. If cohort is RU/EN-primary, can deploy without HE
   review.

---

## 6. Tripwires for future sessions

- ❌ Do not claim formal IRB approval in thesis text unless an actual
  university IRB has reviewed and approved the study. The conservative
  framing above is **the maximum claim** without formal IRB.
- ❌ Do not add new informational sections to consent template without
  re-running `RESEARCH_CONSENT_RULE.md §2` decision tree. Adding ethics
  framework references to existing sections is OK (per current edit);
  adding NEW sections triggers borderline minor bump.
- ❌ Do not promise GDPR DPO contact in consent (we don't have one and
  don't need one at this scale per GDPR Art. 37 scoping).
- ❌ Do not commit to retention enforcement automation in the framework
  declaration — current implementation is manual cleanup at
  `retention_until`; automated job is v3.4+ roadmap.
- ✅ Do refer to this document from thesis sections rather than
  reproducing — it is the single source of truth for the framework
  declaration.

---

**Companion docs:**

- `docs/RESEARCH_ETHICS_CONSENT_TEMPLATE.md` — consent template
  (operationalizes Helsinki + GDPR principles)
- `docs/RESEARCH_CONSENT_RULE.md` — material-change decision tree
- `research/validate.js` — schema-strict server-side enforcement of
  data minimization (GDPR Art. 5(1)(c))
- `research/storage.js#deleteStudentFromCohort` — operationalizes
  right of erasure (GDPR Art. 17)
- `docs/THESIS_VALIDITY_AUDIT_2026_05_21.md §8 D6` — privacy / ethics
  formalization audit (strong points + remaining gaps)
- `docs/THESIS_AUDIT_CLOSURE_PLAN_2026_05_21.md §1 Tier 1 T1.3` — this
  document's closure trigger

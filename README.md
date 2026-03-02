<p align="center">
  <a href="https://eburon.ai/">
    <img src="https://eburon.ai/icon-eburon.svg" alt="Eburon AI" width="120" />
  </a>
</p>

<h1 align="center">Eburon AI Autonomous Agent Model 🤖⚙️</h1>

<p align="center">
  <a href="https://eburon.ai/">eburon.ai</a> · Private Model · codemax-v3
</p>

---

**codemax-v3** is a **tool-augmented, agentic software engineering model** tuned for *long-horizon* engineering tasks: repository-scale reasoning, architecture synthesis, implementation, verification, and hardening—optimized for **deterministic, production-grade code emission** under constraint-heavy requirements.

---

## Capability Profile (Deep Technical)

- **Agentic code synthesis & lifecycle closure**
  - Multi-stage solution construction: **requirements → architecture → implementation → tests → integration notes**
  - Bias toward **complete artifacts** (no stubs, no TODO scaffolds, no "left as an exercise")
  - Strong preference for **minimal-diff refactors**, interface preservation, and backward compatibility

- **Tool-augmented execution planning**
  - Native **tool-calling affordances** for agent loops (function-style invocation patterns, tool-result grounding)
  - Designed for **closed-loop refinement**: propose → execute tools → validate → patch → re-validate

- **Explicit reasoning mode**
  - Supports **thinking-capable** operation for long-horizon decomposition, risk analysis, and failure-mode enumeration
  - Intended for workflows that separate *internal deliberation* vs *final patched output*

- **Software correctness posture**
  - Emphasis on:
    - input validation / defensive programming
    - error taxonomy and structured exception handling
    - invariants, contracts, and edge-case coverage
    - regression-resistant changesets
  - Strong alignment to **CI-friendly output**: stable formatting, reproducible steps (without embedding runtime commands here)

---

## Model Technical Characteristics

- **Format:** GGUF
- **Architecture family:** `glm4moelite` (Mixture-of-Experts)
- **Parameterization:** ~29.9B total parameters (MoE; sparse activation per token)
- **Quantization:** `Q4_K_M`
- **Artifact size:** ~19GB
- **Context length (model maximum):** **202,752 tokens**
- **Context window (registry display):** ~198K

### MoE Topology (Sparse Compute)
- **Experts:** 64
- **Experts activated per token:** 4
- **Shared experts:** 1

### Transformer/Attention Geometry (Selected)
- **Block count:** 47
- **Attention heads:** 20 (KV heads: 20)
- **Embedding width:** 2048
- **RoPE base:** 1e6
- **Tokenizer family:** GPT-2 compatible vocabulary / pre-tokenization variant (`glm4` pre)

### Default Sampling/Runtime Parameters (Embedded)
```json
{
  "num_ctx": 8192,
  "repeat_penalty": 1.1,
  "temperature": 0.7,
  "top_k": 40,
  "top_p": 0.9
}
```

---

## Behavioral Contract (Operational Semantics)

* **Constraint-first execution**

  * Treats constraints (stack, versions, style, non-breaking interfaces) as **hard requirements**.
* **Repository-scale coherence**

  * Optimizes for **cross-file consistency** (types, naming, dependency boundaries, layering discipline).
* **Security-aware generation**

  * Avoids obvious footguns (insecure defaults, missing auth checks, unsafe serialization, injection vectors).
* **Verification bias**

  * Prefers testable designs; generates tests aligned to the implementation boundary (unit/integration as appropriate).

---

## Private Distribution & Access Control 🔒

This model is intended for **private use** within **[Eburon AI](https://eburon.ai/) / approved collaborators only**.
No public redistribution, mirroring, or third-party hosting is authorized without explicit written permission from Eburon AI.

> If this model appears in a public registry context, treat that as **visibility configuration**, not a grant of redistribution rights. The governing terms remain the license below.

---

## License — Eburon AI Private Model License (EAPML) v1.0

**Copyright (c) 2026 Eburon Technologies / [Eburon AI](https://eburon.ai/). All rights reserved.**
**Founded by Jo Lernout.**

### 1) Definitions

* **"Model"** means the weights, quantized artifacts, manifests, prompts/templates, configuration, metadata, and any accompanying documentation distributed as *codemax-v3*.
* **"You"** means the individual or legal entity exercising permissions under this License.
* **"Authorized Users"** means employees/contractors of You (or You personally, if an individual) who have a legitimate need to use the Model and are bound by confidentiality obligations at least as protective as this License.

### 2) Grant of License

Subject to the terms of this License, Eburon AI grants You a **limited, non-exclusive, non-transferable, revocable** license to:

* **download and use** the Model **solely for internal evaluation and internal development**, and
* run inference with the Model on hardware You control or hardware operated on Your behalf under equivalent confidentiality and access controls.

### 3) Restrictions

You **must not**, and must not permit any third party to:

* **redistribute**, sell, sublicense, rent, lease, lend, publish, disclose, or otherwise make available the Model (or any portion) to any third party;
* **host the Model** as a service accessible by anyone outside Your Authorized Users (including "public API", "shared endpoint", "model-as-a-service", or similar);
* **reverse engineer** the Model, including attempting to extract training data, recover source weights, derive unquantized parameters, or reconstruct proprietary components, except to the extent such restriction is prohibited by applicable law;
* **remove or alter** proprietary notices, watermarks, or attribution embedded in the Model or accompanying metadata;
* use the Model for unlawful activity, or to develop malware, exploits, or other harmful code intended to compromise systems.

### 4) Derivatives and Fine-Tunes

* Any fine-tuned variant, merged model, distillation, quantization variant, adapter, or derivative artifact based on the Model is considered a **Derivative**.
* Derivatives are **not permitted for redistribution** and remain subject to this License unless Eburon AI grants explicit written permission.

### 5) Confidentiality

The Model is **confidential proprietary technology**. You must protect it using reasonable security measures, including:

* access control (least privilege),
* secure storage,
* audit logging where feasible,
* and preventing accidental publication (e.g., public buckets, public registries, public repos).

### 6) Ownership

The Model is licensed, **not sold**. Eburon AI retains all rights, title, and interest in and to the Model.

### 7) Disclaimer of Warranty

THE MODEL IS PROVIDED **"AS IS"** AND **"AS AVAILABLE"**, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR THAT THE MODEL WILL BE ERROR-FREE OR UNINTERRUPTED.

### 8) Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL EBURON AI OR ITS AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR BUSINESS INTERRUPTION, ARISING OUT OF OR RELATED TO THE MODEL OR THIS LICENSE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

### 9) Termination

This License is effective until terminated. It terminates automatically if You breach any term. Upon termination, You must cease use and **delete all copies** of the Model and Derivatives in Your possession or control. **Unauthorized use, redistribution, or hosting of the Model without explicit permission from Eburon AI will be subject to fines and legal action.**

### 10) Governing Law

This License shall be governed by the laws applicable in Belgium, without regard to conflict of law principles, unless otherwise required by applicable law.

### 11) Contact / Permissions

For enterprise licensing, redistribution permissions, or collaborator access requests, contact: **[eburondeveloperph@gmail.com](mailto:eburondeveloperph@gmail.com)**

---

<p align="center">
  <a href="https://eburon.ai/">
    <img src="https://eburon.ai/icon-eburon.svg" alt="Eburon AI" width="40" />
  </a>
  <br />
  <sub>© 2026 <a href="https://eburon.ai/">Eburon AI</a>. All rights reserved.</sub>
</p>

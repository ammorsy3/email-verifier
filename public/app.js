const form = document.getElementById("verify-form");
const emailInput = document.getElementById("email");
const btn = document.getElementById("verify-btn");
const results = document.getElementById("results");
const suggestion = document.getElementById("suggestion");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = emailInput.value.trim();
  if (!email) return;

  btn.disabled = true;
  results.className = "results loading";
  results.textContent = "Verifying...";
  suggestion.className = "suggestion hidden";
  suggestion.innerHTML = "";

  try {
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();

    if (data.error && !data.email) {
      results.className = "results invalid";
      results.innerHTML = `<div class="result-header">Error</div><div class="result-detail">${data.error}</div>`;
      return;
    }

    // Suggestion
    if (data.suggestedDomain) {
      const local = email.split("@")[0];
      const suggested = `${local}@${data.suggestedDomain}`;
      suggestion.className = "suggestion";
      suggestion.innerHTML = `Did you mean <a id="suggestion-link">${suggested}</a>?`;
      document.getElementById("suggestion-link").addEventListener("click", () => {
        emailInput.value = suggested;
        suggestion.className = "suggestion hidden";
        form.dispatchEvent(new Event("submit"));
      });
    }

    const isValid = data.isValid;
    results.className = `results ${isValid ? "valid" : "invalid"}`;

    let html = `<div class="result-header">${isValid ? "Valid" : "Invalid"} Email</div>`;

    // Checks list
    const checkOrder = [
      { key: "format", label: "Format" },
      { key: "mx", label: "MX Records" },
      { key: "smtp", label: "SMTP" },
      { key: "disposable", label: "Disposable" },
      { key: "roleBased", label: "Role-based" },
      { key: "freeProvider", label: "Free Provider" },
    ];

    html += `<ul class="checks-list">`;
    for (const { key, label } of checkOrder) {
      const check = data.checks[key];
      if (!check) continue;
      const icon = check.passed
        ? `<span class="check-icon pass">&#10003;</span>`
        : `<span class="check-icon fail">&#10007;</span>`;
      html += `<li>${icon}<span class="check-label">${label}</span><span class="check-message">${check.message}</span></li>`;
    }
    html += `</ul>`;

    // Catch-all badge
    if (data.isCatchAll) {
      html += `<span class="badge catch-all">Catch-all domain</span>`;
    }

    // MX records collapsible
    const mxCheck = data.checks.mx;
    if (mxCheck && mxCheck.records && mxCheck.records.length > 0) {
      html += `<details class="mx-toggle"><summary>View MX Records (${mxCheck.records.length})</summary><ul class="mx-list">`;
      for (const mx of mxCheck.records) {
        html += `<li>${mx.exchange} (priority: ${mx.priority})</li>`;
      }
      html += `</ul></details>`;
    }

    results.innerHTML = html;
  } catch {
    results.className = "results invalid";
    results.innerHTML = `<div class="result-header">Error</div><div class="result-detail">Failed to connect to server</div>`;
  } finally {
    btn.disabled = false;
  }
});

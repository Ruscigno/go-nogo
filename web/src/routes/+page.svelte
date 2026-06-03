<script lang="ts">
  import type { PageData } from "./$types";
  import type { Verdict } from "$lib/gonogo/types";

  let { data }: { data: PageData } = $props();

  const VERDICT_LABEL: Record<Verdict, string> = {
    go: "GO",
    caution: "CAUTION",
    no_go: "NO-GO",
    unknown: "UNKNOWN",
  };
</script>

<section class="dash">
  <header class="dash__head">
    <h1>Go / No-Go</h1>
    <p class="dash__sub">
      Signed in as {data.me.email} ·
      {#if data.needsAttention === 0}
        <span class="ok">all legs are GO against your minimums</span>
      {:else}
        <span class="warn">{data.needsAttention} need your attention</span>
      {/if}
    </p>
  </header>

  <ul class="legs">
    {#each data.verdicts as leg (leg.id)}
      <li class="leg leg--{leg.verdict.overall}">
        <div class="leg__top">
          <span class="leg__label">{leg.label}</span>
          <span class="badge badge--{leg.verdict.overall}"
            >{VERDICT_LABEL[leg.verdict.overall]}</span
          >
        </div>
        <ul class="factors">
          {#each leg.verdict.factors as f (f.key)}
            <li class="factor">
              <span
                class="factor__dot factor__dot--{f.verdict}"
                aria-hidden="true"
              ></span>
              <span class="factor__label">{f.label}</span>
              <span class="factor__verdict factor__verdict--{f.verdict}"
                >{VERDICT_LABEL[f.verdict]}</span
              >
              <span class="factor__detail">{f.detail}</span>
            </li>
          {/each}
        </ul>
      </li>
    {/each}
  </ul>

  <!--
    Aviation-domain disclaimer — calibrated FIRM (CLAUDE.md / security.md:
    just below tail-number-radar's launch-blocking contract). Verbatim core
    statement; MUST appear on every verdict surface. Missing it here is a
    CONCERN-level finding flagged by the weather-and-verdict-auditor.
  -->
  <p class="disclaimer">
    Go/No-Go is an advisory aid. The pilot in command is solely responsible for
    the go/no-go decision. The verdict is computed from minimums you entered and
    from public weather data that may be stale, delayed, or incomplete. Obtain
    an official weather briefing before every flight.
  </p>
</section>

<style>
  .dash {
    max-width: 48rem;
    margin: 0 auto;
    padding: 2.5rem 1rem;
  }
  .dash__head h1 {
    font-size: 1.875rem;
    font-weight: 600;
    margin: 0;
  }
  .dash__sub {
    color: #64748b;
    margin-top: 0.25rem;
  }
  .ok {
    color: #15803d;
    font-weight: 600;
  }
  .warn {
    color: #b45309;
    font-weight: 600;
  }
  .legs {
    list-style: none;
    padding: 0;
    margin: 1.5rem 0 0;
    display: grid;
    gap: 0.875rem;
  }
  .leg {
    border: 1px solid #e2e8f0;
    border-left-width: 4px;
    border-radius: 0.5rem;
    padding: 0.875rem 1rem;
  }
  .leg--go {
    border-left-color: #16a34a;
  }
  .leg--caution {
    border-left-color: #d97706;
  }
  .leg--no_go {
    border-left-color: #dc2626;
  }
  .leg--unknown {
    border-left-color: #64748b;
  }
  .leg__top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }
  .leg__label {
    font-weight: 600;
  }
  .badge {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    white-space: nowrap;
  }
  .badge--go {
    background: #dcfce7;
    color: #15803d;
  }
  .badge--caution {
    background: #fef3c7;
    color: #b45309;
  }
  .badge--no_go {
    background: #fee2e2;
    color: #b91c1c;
  }
  .badge--unknown {
    background: #e2e8f0;
    color: #475569;
  }
  .factors {
    list-style: none;
    padding: 0;
    margin: 0.75rem 0 0;
    display: grid;
    gap: 0.375rem;
  }
  .factor {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: baseline;
    column-gap: 0.5rem;
    font-size: 0.875rem;
  }
  .factor__dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 999px;
    align-self: center;
  }
  .factor__dot--go {
    background: #16a34a;
  }
  .factor__dot--caution {
    background: #d97706;
  }
  .factor__dot--no_go {
    background: #dc2626;
  }
  .factor__dot--unknown {
    background: #94a3b8;
  }
  .factor__label {
    color: #1e293b;
  }
  .factor__verdict {
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .factor__verdict--go {
    color: #15803d;
  }
  .factor__verdict--caution {
    color: #b45309;
  }
  .factor__verdict--no_go {
    color: #b91c1c;
  }
  .factor__verdict--unknown {
    color: #475569;
  }
  .factor__detail {
    grid-column: 2 / -1;
    color: #94a3b8;
    font-size: 0.8125rem;
  }
  .disclaimer {
    margin-top: 1.75rem;
    padding-top: 1rem;
    border-top: 1px solid #e2e8f0;
    color: #64748b;
    font-size: 0.8125rem;
  }
</style>

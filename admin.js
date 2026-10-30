const SUPABASE_URL = "https://zppqorgbronslvzrbatt.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_94hJlXud2vHJfrUw3EVGsA_RuQcGNoV";

const connectionStatus = document.querySelector("#admin-connection-status");
const accessError = document.querySelector("#admin-access-error");
const dashboard = document.querySelector("#admin-dashboard");
const statusHeading = document.querySelector("#admin-status-heading");
const statusDescription = document.querySelector("#admin-status-description");
const resultsList = document.querySelector("#admin-contestant-list");
const totalVotes = document.querySelector("#admin-total-votes");
const voteLabel = document.querySelector("#admin-vote-label");
const refreshButton = document.querySelector("#admin-refresh-button");
const toggleButton = document.querySelector("#voting-toggle-button");
const toast = document.querySelector("#admin-toast");

let databaseClient;
let votingOpen = false;
let isLoading = false;
let isUpdating = false;
let toastTimeout;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("is-visible"), 3200);
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatVoteCount(count) {
  const label = count === 1 ? "hlas" : count >= 2 && count <= 4 ? "hlasy" : "hlasů";
  return `${count} ${label}`;
}

function renderResults(contestants) {
  const total = contestants.reduce((sum, contestant) => sum + contestant.votes, 0);
  totalVotes.textContent = String(total);
  voteLabel.textContent = total === 1 ? "hlas" : total >= 2 && total <= 4 ? "hlasy" : "hlasů";

  if (contestants.length === 0) {
    resultsList.replaceChildren(makeElement("div", "empty-state", "Zatím nebyl přidán žádný soutěžící."));
    return;
  }

  const sortedContestants = [...contestants].sort(
    (first, second) => second.votes - first.votes || first.name.localeCompare(second.name, "cs")
  );
  const cards = document.createDocumentFragment();
  for (const contestant of sortedContestants) {
    const card = makeElement("article", "admin-contestant-card");
    const name = makeElement("h3", "contestant-name", contestant.name);
    const count = makeElement("span", "result-count", formatVoteCount(contestant.votes));
    const meter = makeElement("div", "vote-meter");
    const percentage = total === 0 ? 0 : Math.round((contestant.votes / total) * 100);
    meter.setAttribute("role", "progressbar");
    meter.setAttribute("aria-label", `Podíl hlasů pro ${contestant.name}`);
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", "100");
    meter.setAttribute("aria-valuenow", String(percentage));
    const fill = makeElement("span", "vote-meter-fill");
    fill.style.width = `${percentage}%`;
    meter.append(fill);
    card.append(name, count, meter);
    cards.append(card);
  }
  resultsList.replaceChildren(cards);
}

function renderVotingState() {
  statusHeading.textContent = votingOpen ? "Hlasování probíhá" : "Hlasování je ukončeno";
  statusDescription.textContent = votingOpen
    ? "Účastníci mohou odesílat nebo měnit své hlasy."
    : "Účastníci nemohou odesílat, měnit ani vracet hlasy.";
  toggleButton.textContent = votingOpen ? "Ukončit hlasování" : "Spustit hlasování";
  toggleButton.classList.toggle("is-danger", votingOpen);
  toggleButton.disabled = isUpdating;
}

async function loadAdminData({ announce = false } = {}) {
  if (isLoading) return;
  isLoading = true;
  refreshButton.disabled = true;
  connectionStatus.textContent = "Načítám výsledky";
  try {
    const [resultsResponse, statusResponse] = await Promise.all([
      databaseClient.rpc("get_admin_vote_results"),
      databaseClient.rpc("get_poll_status")
    ]);
    if (resultsResponse.error) throw resultsResponse.error;
    if (statusResponse.error) throw statusResponse.error;

    votingOpen = statusResponse.data === true;
    renderVotingState();
    renderResults(resultsResponse.data.map((contestant) => ({
      ...contestant,
      votes: Number(contestant.votes)
    })));
    accessError.hidden = true;
    dashboard.hidden = false;
    connectionStatus.textContent = "Připojeno";
    if (announce) showToast("Výsledky byly obnoveny.");
  } catch (error) {
    accessError.textContent = `Výsledky se nepodařilo načíst. Zkontroluj připojení a nastavení Supabase. (${error.message})`;
    accessError.hidden = false;
    dashboard.hidden = true;
    connectionStatus.textContent = "Nelze načíst";
  } finally {
    isLoading = false;
    refreshButton.disabled = false;
  }
}

async function setVotingOpen(open) {
  if (isUpdating) return;
  isUpdating = true;
  renderVotingState();
  try {
    const { error } = await databaseClient.rpc("set_voting_open", { p_open: open });
    if (error) throw error;
    votingOpen = open;
    showToast(open ? "Hlasování bylo spuštěno." : "Hlasování bylo ukončeno.");
    await loadAdminData();
  } catch (error) {
    showToast(`Stav hlasování se nepodařilo změnit: ${error.message}`);
  } finally {
    isUpdating = false;
    renderVotingState();
  }
}

refreshButton.addEventListener("click", () => loadAdminData({ announce: true }));
toggleButton.addEventListener("click", () => setVotingOpen(!votingOpen));

function start() {
  if (!window.supabase?.createClient) {
    accessError.textContent = "Supabase se nenačetlo. Zkontroluj připojení k internetu a obnov stránku.";
    connectionStatus.textContent = "NEDOSTUPNÉ";
    return;
  }
  if (SUPABASE_URL.includes("YOUR_PROJECT_ID") || SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY")) {
    accessError.textContent = "Nastav Supabase URL a anon key v admin.js.";
    connectionStatus.textContent = "VYŽADUJE NASTAVENÍ";
    return;
  }

  databaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  loadAdminData();
  window.setInterval(() => loadAdminData(), 15_000);
}

start();

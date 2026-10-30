const SUPABASE_URL = "https://zppqorgbronslvzrbatt.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_94hJlXud2vHJfrUw3EVGsA_RuQcGNoV";
const participantKey = "costume-royale-participant";
const voteKey = "costume-royale-vote";

const contestantList = document.querySelector("#contestant-list");
const voteMessage = document.querySelector("#vote-message");
const connectionStatus = document.querySelector("#connection-status");
const votingStatus = document.querySelector("#voting-status");
const contestantForm = document.querySelector("#contestant-form");
const refreshButton = document.querySelector("#refresh-button");
const withdrawVoteButton = document.querySelector("#withdraw-vote-button");
const toast = document.querySelector("#toast");

let toastTimeout;
let databaseClient;
let loadingResults = false;
let refreshQueued = false;
let votingInProgress = false;
let votingOpen = false;

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

function getOrCreateParticipantId() {
  let id = localStorage.getItem(participantKey);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(participantKey, id);
  }
  return id;
}

function render(contestants) {
  const votedFor = localStorage.getItem(voteKey);
  withdrawVoteButton.hidden = !votedFor;
  withdrawVoteButton.disabled = votingInProgress || !votingOpen;
  contestantList.replaceChildren();

  if (contestants.length === 0) {
    contestantList.append(makeElement("div", "empty-state", "Zatím tu nikdo není. Přidej prvního soutěžícího níže."));
  } else {
    const cards = document.createDocumentFragment();
    for (const contestant of contestants) {
      const card = makeElement("article", "contestant-card");
      if (contestant.id === votedFor) card.classList.add("is-selected");
      const name = makeElement("h3", "contestant-name", contestant.name);
      const voteButton = makeElement("button", "vote-button");
      voteButton.type = "button";
      voteButton.disabled = votingInProgress || Boolean(votedFor) || !votingOpen;
      voteButton.setAttribute("aria-label", contestant.id === votedFor
        ? `${contestant.name}, tvůj současný hlas`
        : votedFor ? "Hlas už byl odeslán" : `Hlasovat pro ${contestant.name}`);
      voteButton.textContent = contestant.id === votedFor ? "Tvůj výběr" : "Hlasovat";
      voteButton.addEventListener("click", () => castVote(contestant.id));
      card.append(name, voteButton);
      cards.append(card);
    }
    contestantList.replaceChildren(cards);
  }

  if (!votingOpen) {
    voteMessage.textContent = "Hlasování je ukončeno. Hlasy jsou uzavřené.";
  } else if (votedFor) {
    const picked = contestants.find((contestant) => contestant.id === votedFor);
    voteMessage.textContent = picked
      ? `Hlasoval/a jsi pro ${picked.name}. Můžeš ho vrátit a hlasovat znovu.`
      : "Máš odhlasováno. Vem si hlas zpátky a hlasuj znovu.";
  } else {
    voteMessage.textContent = "Vyber jednoho soutěžícího a odešli svůj hlas.";
  }
}

async function loadResults({ announce = false, notifyOnError = true } = {}) {
  if (loadingResults) {
    refreshQueued = true;
    return;
  }
  loadingResults = true;
  refreshButton.disabled = true;
  refreshButton.classList.add("is-refreshing");
  connectionStatus.textContent = "Načítám";
  try {
    const [contestantsResult, statusResult] = await Promise.all([
      databaseClient.rpc("get_contestants"),
      databaseClient.rpc("get_poll_status")
    ]);
    if (contestantsResult.error) throw contestantsResult.error;
    if (statusResult.error) throw statusResult.error;
    votingOpen = statusResult.data === true;
    votingStatus.textContent = votingOpen ? "Hlasování probíhá" : "Hlasování je ukončeno";
    votingStatus.classList.toggle("is-closed", !votingOpen);
    render(contestantsResult.data);
    connectionStatus.textContent = "Připojeno · obnovuje se každých 15 sekund";
    if (announce) showToast("Seznam byl obnoven.");
  } catch (error) {
    votingOpen = false;
    votingStatus.textContent = "Stav hlasování není dostupný";
    votingStatus.classList.add("is-closed");
    contestantList.replaceChildren(makeElement("div", "empty-state", "Výsledky nejsou dostupné. Zkus je obnovit."));
    contestantList.querySelectorAll(".vote-button").forEach((button) => {
      button.disabled = true;
    });
    withdrawVoteButton.disabled = true;
    connectionStatus.textContent = "Nelze se připojit";
    if (notifyOnError) showToast(`Hlasování se nepodařilo načíst: ${error.message}`);
  } finally {
    loadingResults = false;
    refreshButton.disabled = false;
    refreshButton.classList.remove("is-refreshing");
    if (refreshQueued) {
      refreshQueued = false;
      loadResults({ notifyOnError: false });
    }
  }
}

async function castVote(contestantId) {
  const previousVote = localStorage.getItem(voteKey);
  if (votingInProgress || !votingOpen || previousVote === contestantId) return;
  votingInProgress = true;
  contestantList.querySelectorAll(".vote-button").forEach((button) => {
    button.disabled = true;
  });
  let failureMessage;
  try {
    const { error } = await databaseClient.rpc("set_vote", {
      p_voter_id: getOrCreateParticipantId(),
      p_contestant_id: contestantId
    });
    if (error) throw error;
    localStorage.setItem(voteKey, contestantId);
    showToast(previousVote ? "Tvůj hlas byl změněn." : "Odhlasoval/a jsi.");
  } catch (error) {
    failureMessage = `Hlas se nepodařilo odeslat: ${error.message}`;
  } finally {
    votingInProgress = false;
    await loadResults();
    if (failureMessage) {
      voteMessage.textContent = failureMessage;
      showToast(failureMessage);
    }
  }
}

async function withdrawVote() {
  if (votingInProgress || !votingOpen || !localStorage.getItem(voteKey)) return;
  votingInProgress = true;
  withdrawVoteButton.disabled = true;
  contestantList.querySelectorAll(".vote-button").forEach((button) => {
    button.disabled = true;
  });

  let failureMessage;
  try {
    const { error } = await databaseClient.rpc("withdraw_vote", {
      p_voter_id: getOrCreateParticipantId()
    });
    if (error) throw error;
    localStorage.removeItem(voteKey);
    showToast("Tvůj hlas byl vrácen.");
  } catch (error) {
    failureMessage = `Hlas se nepodařilo vrátit: ${error.message}`;
  } finally {
    votingInProgress = false;
    await loadResults();
    if (failureMessage) {
      voteMessage.textContent = failureMessage;
      showToast(failureMessage);
    }
  }
}

contestantForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(contestantForm);
  const submitButton = contestantForm.querySelector("button");
  submitButton.disabled = true;
  try {
    const { error } = await databaseClient.from("contestants").insert({
      name: String(formData.get("name")).trim()
    });
    if (error) throw error;
    contestantForm.reset();
    document.querySelector("#contestant-name").focus();
    showToast("Soutěžící přidán/a.");
    await loadResults();
  } catch (error) {
    showToast(`Soutěžícího se nepodařilo přidat: ${error.message}`);
  } finally {
    submitButton.disabled = false;
  }
});

refreshButton.addEventListener("click", () => loadResults({ announce: true }));
withdrawVoteButton.addEventListener("click", withdrawVote);

function start() {
  if (!window.supabase?.createClient) {
    connectionStatus.textContent = "NEDOSTUPNÉ";
    showToast("Supabase se nenačetlo. Zkontroluj připojení k internetu a obnov stránku.");
    refreshButton.disabled = true;
    contestantForm.querySelector("button").disabled = true;
    return;
  }

  if (SUPABASE_URL.includes("YOUR_PROJECT_ID") || SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY")) {
    connectionStatus.textContent = "VYŽADUJE NASTAVENÍ";
    showToast("Nastav Supabase URL a anon key v script.js.");
    refreshButton.disabled = true;
    contestantForm.querySelector("button").disabled = true;
    return;
  }

  databaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  loadResults();
  window.setInterval(() => loadResults({ notifyOnError: false }), 15_000);
}

start();

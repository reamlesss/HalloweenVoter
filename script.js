const SUPABASE_URL = "https://zppqorgbronslvzrbatt.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_94hJlXud2vHJfrUw3EVGsA_RuQcGNoV";
const participantKey = "costume-royale-participant";
const voteKey = "costume-royale-vote";

const contestantList = document.querySelector("#contestant-list");
const voteMessage = document.querySelector("#vote-message");
const voteTotal = document.querySelector("#total-votes");
const voteLabel = document.querySelector("#vote-label");
const costumeCount = document.querySelector("#costume-count");
const connectionStatus = document.querySelector("#connection-status");
const contestantForm = document.querySelector("#contestant-form");
const refreshButton = document.querySelector("#refresh-button");
const toast = document.querySelector("#toast");

let toastTimeout;
let databaseClient;
let loadingResults = false;
let refreshQueued = false;

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
  const highestVotes = Math.max(0, ...contestants.map((contestant) => contestant.votes));
  contestantList.replaceChildren();
  voteTotal.textContent = contestants.reduce((sum, contestant) => sum + contestant.votes, 0);
  voteLabel.textContent = Number(voteTotal.textContent) === 1 ? "VOTE CAST" : "VOTES CAST";
  costumeCount.textContent = contestants.length;

  if (contestants.length === 0) {
    const empty = makeElement("div", "empty-state");
    empty.append(
      makeElement("span", "empty-icon", "♧"),
      makeElement("p", "", "No costumes yet. Add the first one below!")
    );
    contestantList.append(empty);
    voteMessage.textContent = "";
    return;
  }

  const sortedContestants = [...contestants].sort(
    (first, second) => second.votes - first.votes || new Date(first.created_at) - new Date(second.created_at)
  );

  for (const [index, contestant] of sortedContestants.entries()) {
    const card = makeElement("article", "contestant-card");
    if (contestant.id === votedFor) card.classList.add("is-selected");
    const position = makeElement("span", "contestant-rank", String(index + 1).padStart(2, "0"));
    const identity = makeElement("div", "contestant-identity");
    identity.append(
      makeElement("h3", "contestant-name", contestant.name),
      makeElement("p", "contestant-costume", contestant.costume)
    );
    const results = makeElement("div", "contestant-results");
    const resultText = makeElement("div", "result-text");
    resultText.append(
      makeElement("span", "result-count", String(contestant.votes)),
      makeElement("span", "result-label", contestant.votes === 1 ? "VOTE" : "VOTES")
    );
    const bar = makeElement("div", "vote-bar");
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-label", `${contestant.votes} votes`);
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", String(Math.max(highestVotes, 1)));
    bar.setAttribute("aria-valuenow", String(contestant.votes));
    const fill = makeElement("span", "vote-bar-fill");
    fill.style.width = `${highestVotes === 0 ? 0 : (contestant.votes / highestVotes) * 100}%`;
    bar.append(fill);
    results.append(resultText, bar);

    const voteButton = makeElement("button", "vote-button");
    voteButton.type = "button";
    voteButton.disabled = Boolean(votedFor);
    voteButton.setAttribute("aria-label", votedFor ? `${contestant.name}, vote already submitted` : `Vote for ${contestant.name}`);
    voteButton.textContent = contestant.id === votedFor ? "YOUR PICK" : votedFor ? "VOTED" : "VOTE";
    voteButton.addEventListener("click", () => castVote(contestant.id, voteButton));

    card.append(position, identity, results, voteButton);
    contestantList.append(card);
  }

  if (votedFor) {
    const picked = contestants.find((contestant) => contestant.id === votedFor);
    voteMessage.textContent = picked
      ? `Your vote is in for ${picked.name}. Refresh to see the latest results.`
      : "Your vote is already in. Refresh to see the latest results.";
  } else {
    voteMessage.textContent = "Choose one costume to cast your vote.";
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
  connectionStatus.textContent = "UPDATING";
  try {
    const { data, error } = await databaseClient.rpc("get_vote_results");
    if (error) throw error;
    const contestants = data.map((contestant) => ({
      ...contestant,
      votes: Number(contestant.votes)
    }));
    render(contestants);
    connectionStatus.textContent = "CONNECTED";
    document.querySelector(".live-pill").classList.add("is-live");
    if (announce) showToast("Vote totals refreshed.");
  } catch (error) {
    connectionStatus.textContent = "OFFLINE";
    document.querySelector(".live-pill").classList.remove("is-live");
    if (notifyOnError) showToast(`Could not load votes: ${error.message}`);
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

async function castVote(contestantId, button) {
  if (localStorage.getItem(voteKey)) return;
  button.disabled = true;
  try {
    const { error } = await databaseClient.rpc("cast_vote", {
      p_voter_id: getOrCreateParticipantId(),
      p_contestant_id: contestantId
    });
    if (error) throw error;
    localStorage.setItem(voteKey, contestantId);
    showToast("Your vote is in. May the best costume win!");
    await loadResults();
  } catch (error) {
    showToast(error.message.includes("already voted")
      ? "This browser has already voted."
      : `Your vote could not be submitted: ${error.message}`);
    await loadResults();
  }
}

contestantForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(contestantForm);
  const submitButton = contestantForm.querySelector("button");
  submitButton.disabled = true;
  try {
    const { error } = await databaseClient.from("contestants").insert({
      name: String(formData.get("name")).trim(),
      costume: String(formData.get("costume")).trim()
    });
    if (error) throw error;
    contestantForm.reset();
    document.querySelector("#contestant-name").focus();
    showToast("Costume added to the lineup!");
    await loadResults();
  } catch (error) {
    showToast(`Costume could not be added: ${error.message}`);
  } finally {
    submitButton.disabled = false;
  }
});

refreshButton.addEventListener("click", () => loadResults({ announce: true }));

function start() {
  if (!window.supabase?.createClient) {
    connectionStatus.textContent = "UNAVAILABLE";
    showToast("Supabase could not load. Check your internet connection and reload.");
    refreshButton.disabled = true;
    contestantForm.querySelector("button").disabled = true;
    return;
  }

  if (SUPABASE_URL.includes("YOUR_PROJECT_ID") || SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY")) {
    connectionStatus.textContent = "SETUP NEEDED";
    showToast("Add your Supabase project URL and anon key in script.js to enable voting.");
    refreshButton.disabled = true;
    contestantForm.querySelector("button").disabled = true;
    return;
  }

  databaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  loadResults();
  window.setInterval(() => loadResults({ notifyOnError: false }), 15_000);
}

start();

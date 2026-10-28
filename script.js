const SUPABASE_URL = "https://zppqorgbronslvzrbatt.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_94hJlXud2vHJfrUw3EVGsA_RuQcGNoV";
const participantKey = "costume-royale-participant";
const voteKey = "costume-royale-vote";

const contestantList = document.querySelector("#contestant-list");
const voteMessage = document.querySelector("#vote-message");
const voteTotal = document.querySelector("#total-votes");
const voteLabel = document.querySelector("#vote-label");
const connectionStatus = document.querySelector("#connection-status");
const contestantForm = document.querySelector("#contestant-form");
const refreshButton = document.querySelector("#refresh-button");
const withdrawVoteButton = document.querySelector("#withdraw-vote-button");
const toast = document.querySelector("#toast");

let toastTimeout;
let databaseClient;
let loadingResults = false;
let refreshQueued = false;
let votingInProgress = false;

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
  withdrawVoteButton.disabled = votingInProgress;
  contestantList.replaceChildren();
  voteTotal.textContent = contestants.reduce((sum, contestant) => sum + contestant.votes, 0);
  voteLabel.textContent = Number(voteTotal.textContent) === 1 ? "vote" : "votes";

  if (contestants.length === 0) {
    const empty = makeElement("div", "empty-state");
    empty.textContent = "No names yet. Add the first one below.";
    contestantList.append(empty);
    voteMessage.textContent = "";
    return;
  }

  const sortedContestants = [...contestants].sort(
    (first, second) => second.votes - first.votes || new Date(first.created_at) - new Date(second.created_at)
  );

  for (const contestant of sortedContestants) {
    const card = makeElement("article", "contestant-card");
    if (contestant.id === votedFor) card.classList.add("is-selected");
    const name = makeElement("h3", "contestant-name", contestant.name);
    const voteCount = makeElement("span", "result-count", `${contestant.votes} ${contestant.votes === 1 ? "vote" : "votes"}`);

    const voteButton = makeElement("button", "vote-button");
    voteButton.type = "button";
    voteButton.disabled = votingInProgress || Boolean(votedFor);
    voteButton.setAttribute("aria-label", contestant.id === votedFor
      ? `${contestant.name}, your current vote`
      : votedFor ? "Vote already submitted" : `Vote for ${contestant.name}`);
    voteButton.textContent = contestant.id === votedFor ? "Your vote" : "Vote";
    voteButton.addEventListener("click", () => castVote(contestant.id));

    card.append(name, voteCount, voteButton);
    contestantList.append(card);
  }

  if (votedFor) {
    const picked = contestants.find((contestant) => contestant.id === votedFor);
    voteMessage.textContent = picked
      ? `Your vote is for ${picked.name}. Take it back to vote again.`
      : "Your vote is in. Take it back to vote again.";
  } else {
    voteMessage.textContent = "Choose your favourite person to cast your vote.";
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
    connectionStatus.textContent = "Connected · updates every 15 seconds";
    if (announce) showToast("Vote totals refreshed.");
  } catch (error) {
    connectionStatus.textContent = "Unable to connect";
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

async function castVote(contestantId) {
  const previousVote = localStorage.getItem(voteKey);
  if (votingInProgress || previousVote === contestantId) return;
  votingInProgress = true;
  let failureMessage;
  contestantList.querySelectorAll(".vote-button").forEach((voteButton) => {
    voteButton.disabled = true;
  });
  try {
    const { error } = await databaseClient.rpc("set_vote", {
      p_voter_id: getOrCreateParticipantId(),
      p_contestant_id: contestantId
    });
    if (error) throw error;
    localStorage.setItem(voteKey, contestantId);
    showToast(previousVote ? "Your vote has been changed." : "Your vote is in.");
  } catch (error) {
    failureMessage = error.code === "PGRST202" || error.message.includes("set_vote")
      ? "Vote changes are not enabled in Supabase yet. Run the vote-update SQL in README.md, then refresh."
      : `Your vote could not be changed: ${error.message}`;
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
  if (votingInProgress || !localStorage.getItem(voteKey)) return;
  votingInProgress = true;
  withdrawVoteButton.disabled = true;
  contestantList.querySelectorAll(".vote-button").forEach((voteButton) => {
    voteButton.disabled = true;
  });

  let failureMessage;
  try {
    const { error } = await databaseClient.rpc("withdraw_vote", {
      p_voter_id: getOrCreateParticipantId()
    });
    if (error) throw error;
    localStorage.removeItem(voteKey);
    showToast("Your vote was taken back. You can vote again.");
  } catch (error) {
    failureMessage = error.code === "PGRST202" || error.message.includes("withdraw_vote")
      ? "Vote withdrawal is not enabled in Supabase yet. Run the withdraw-vote SQL in README.md, then refresh."
      : `Your vote could not be taken back: ${error.message}`;
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
    showToast("Name added.");
    await loadResults();
  } catch (error) {
    showToast(`Costume could not be added: ${error.message}`);
  } finally {
    submitButton.disabled = false;
  }
});

refreshButton.addEventListener("click", () => loadResults({ announce: true }));
withdrawVoteButton.addEventListener("click", withdrawVote);

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

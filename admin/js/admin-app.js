const AUTH_KEY = "concept-web-shop-admin-auth";
const USERNAME = "carla123";
const PASSWORD = "marleyangelbaby";

const loginSection = document.getElementById("admin-login");
const loginForm = document.getElementById("admin-login-form");
const usernameField = document.getElementById("admin-username");
const passwordField = document.getElementById("admin-password");
const errorMessage = document.getElementById("admin-login-error");
const adminShell = document.getElementById("admin-shell");
const logoutButton = document.getElementById("admin-logout");

let appLoaded = false;

const activateAdminApp = async () => {
  if (loginSection) {
    loginSection.hidden = true;
  }
  if (adminShell) {
    adminShell.hidden = false;
  }

  if (!appLoaded) {
    try {
      await import("../../js/app.js");
      appLoaded = true;
    } catch (error) {
      console.error("Unable to load admin application", error);
      errorMessage?.removeAttribute("hidden");
      if (loginSection) loginSection.hidden = false;
      if (adminShell) adminShell.hidden = true;
      return;
    }
  }
};

const validateCredentials = (username, password) => {
  return username === USERNAME && password === PASSWORD;
};

const handleLoginSubmit = async (event) => {
  event.preventDefault();
  const username = usernameField?.value?.trim() ?? "";
  const password = passwordField?.value ?? "";

  if (!validateCredentials(username, password)) {
    if (errorMessage) {
      errorMessage.textContent = "try again";
      errorMessage.hidden = false;
    }
    passwordField?.focus({ preventScroll: true });
    passwordField?.select?.();
    return;
  }

  sessionStorage.setItem(AUTH_KEY, "true");
  if (errorMessage) {
    errorMessage.hidden = true;
  }
  await activateAdminApp();
};

const handleLogout = () => {
  sessionStorage.removeItem(AUTH_KEY);
  window.location.reload();
};

if (loginForm) {
  loginForm.addEventListener("submit", handleLoginSubmit);
}

if (logoutButton) {
  logoutButton.addEventListener("click", handleLogout);
}

if (loginSection) {
  loginSection.removeAttribute("hidden");
}

if (sessionStorage.getItem(AUTH_KEY) === "true") {
  activateAdminApp();
} else {
  adminShell?.setAttribute("hidden", "true");
  loginSection?.removeAttribute("hidden");
  usernameField?.focus({ preventScroll: true });
}

const balanced = require("balanced-match");

if (typeof balanced === "function" && typeof balanced.balanced !== "function") {
  balanced.balanced = balanced;
}

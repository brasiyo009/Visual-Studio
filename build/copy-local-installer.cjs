const fs = require("node:fs/promises");
const path = require("node:path");
const { version } = require("../package.json");

module.exports = async function copyLocalInstaller({ artifactPaths }) {
  const filename = `Druckpreis-${version}-${process.arch}.dmg`;
  const source = artifactPaths.find((artifact) => path.basename(artifact) === filename);
  if (!source) return [];

  const destination = path.join(__dirname, "..", "Druckpreis-Installation.dmg");
  const temporary = `${destination}.partial`;
  try {
    await fs.copyFile(source, temporary);
    await fs.rename(temporary, destination);
  } finally {
    await fs.rm(temporary, { force: true });
  }
  console.log(`Installationsdatei für diesen Mac: ${destination}`);
  return [];
};

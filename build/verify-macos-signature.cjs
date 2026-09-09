const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const path = require("node:path");

module.exports = async function verifyMacSignature(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  await promisify(execFile)("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
  console.log(`Verified complete macOS signature: ${appPath}`);
};

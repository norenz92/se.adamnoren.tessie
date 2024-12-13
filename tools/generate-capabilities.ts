import { capabilitiesMap } from "../capabilitiesMap";
import fs from "fs";

const folder = __dirname + "/../.homeycompose/capabilities";

// Create .json file for each capability in capabilitiesMap
const generate = () => {
  // Empty folder
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder);
  } else {
    fs.rmdirSync(folder, {
      recursive: true,
    });
    fs.mkdirSync(folder);
  }

  Object.keys(capabilitiesMap).forEach((key) => {
    const capability = capabilitiesMap[key].capability;
    const fileName = capabilitiesMap[key].capability_id;

    writeFile(
      folder + `/${fileName}.json`,
      JSON.stringify(capability, null, 2)
    );
  });
};

// Create file with content if not exist. If exist, overwrite content
function writeFile(filename: string, content: string) {
  fs.writeFileSync(filename, content);
}

generate();

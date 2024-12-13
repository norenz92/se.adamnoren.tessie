import { capabilites } from "../drivers/capabilityMap";
import fs from "fs";

const folder = __dirname + "/../.homeycompose/capabilities";
const flowFolder = __dirname + "/../drivers/car/driver.flow.compose.json";

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

  let flows: {
    triggers: Array<{
      id: string;
      title:
        | string
        | {
            [key: string]: string;
          };
    }>;
    conditions: Array<{
      id: string;
      title:
        | string
        | {
            [key: string]: string;
          };
    }>;
    actions: Array<{
      id: string;
      args: any;
      title:
        | string
        | {
            [key: string]: string;
          };
    }>;
  } = {
    triggers: [],
    conditions: [],
    actions: [],
  };

  capabilites.forEach((capability) => {
    writeFile(
      folder + `/${capability.capability_id}.json`,
      JSON.stringify(capability.capability, null, 2)
    );

    // Loop through triggers, conditions and actions and create a .json file for each driver like called driver.flow.compose.json inside /drivers/<driver_id>/

    if (capability.triggers) {
      capability.triggers.forEach((trigger) => {
        flows.triggers.push({
          id: trigger.id,
          title: trigger.title,
        });
      });
    }

    if (capability.conditions) {
      capability.conditions.forEach((condition) => {
        flows.conditions.push({
          id: condition.id,
          title: condition.title,
        });
      });
    }

    if (capability.actions) {
      capability.actions.forEach((action) => {
        flows.actions.push({
          id: action.id,
          title: action.title,
          args: action.args,
        });
      });
    }
  });

  // Write all triggers, conditions and actions to a single file called driver.flow.compose.json inside /drivers/<driver_id>/
  writeFile(flowFolder, JSON.stringify(flows, null, 2));
};

// Create file with content if not exist. If exist, overwrite content
function writeFile(filename: string, content: string) {
  fs.writeFileSync(filename, content);
}

generate();

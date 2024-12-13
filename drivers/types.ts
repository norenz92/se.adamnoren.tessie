export interface BaseCapability {
  title: string | { [key: string]: string };
  preventInsights?: boolean;
  preventTag?: boolean;
  icon?: string;
  setable: boolean;
  getable?: boolean;
  units?: string | { [key: string]: string };
  insights?: boolean;
}

export interface BooleanCapability extends BaseCapability {
  type: "boolean";
  insightsTitleTrue?: string | { [key: string]: string };
  insightsTitleFalse?: string | { [key: string]: string };
  titleTrue?: string | { [key: string]: string };
  titleFalse?: string | { [key: string]: string };
  uiQuickAction?: boolean;
  uiComponent: "toggle" | "sensor" | "battery" | "button" | "media";
}

export interface NumberCapability extends BaseCapability {
  type: "number";
  decimals?: number;
  min?: number;
  max?: number;
  step?: number;
  uiComponent: "sensor" | "slider" | "media" | "button" | "battery";
}

export interface EnumCapability extends BaseCapability {
  type: "enum";
  values: {
    id: string;
    title: string | { [key: string]: string };
  }[];
  uiComponent: "color" | "picker" | "ternary" | "media" | "sensor";
}

export interface StringCapability extends BaseCapability {
  type: "string";
  uiComponent: "sensor" | "media";
}

export type Capability =
  | BooleanCapability
  | NumberCapability
  | EnumCapability
  | StringCapability;

export type Trigger = {
  id: string;
  title: string | { [key: string]: string };
  tokens?: {
    name: string;
    type: "dropdown" | "number" | "boolean" | "string";
    title: string | { [key: string]: string };
    example: string | { [key: string]: string };
  }[];
};

export type Condition = {
  id: string;
  title: string | { [key: string]: string };
  titleFormatted?: string | { [key: string]: string };
  hint: string | { [key: string]: string };
  args?: {
    name: string;
    type:
      | "text"
      | "autocomplete"
      | "number"
      | "range"
      | "date"
      | "time"
      | "dropdown"
      | "checkbox"
      | "color";
    values: {
      id: string;
      label: string | { [key: string]: string };
    }[];
  }[];
};

export type Action = {
  id: string;
  title: string | { [key: string]: string };
  hint?: string | { [key: string]: string };
  args?: {
    name: string;
    type:
      | "text"
      | "autocomplete"
      | "number"
      | "range"
      | "date"
      | "time"
      | "dropdown"
      | "checkbox"
      | "color";
    values?: {
      id: string;
      title: string | { [key: string]: string };
    }[];
    min?: number;
    max?: number;
    step?: number;
    title: string | { [key: string]: string };
    titleFormatted?: string | { [key: string]: string };
    placeholder?: string | { [key: string]: string };
  }[];
  action: (
    args: any,
    state: any,
    vin: string,
    access_token: string
  ) => Promise<any>;
};

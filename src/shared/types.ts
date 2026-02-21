export type InstrumentationOptions = {
  readonly prettier: boolean;
  readonly noIf: boolean;
  readonly skipInstrumented: boolean;
  readonly verbose: boolean;
  readonly exclude?: string;
};

export type LoggerInfo = {
  readonly exists: boolean;
  readonly variableName: string;
};

export type IfCondition = {
  readonly condition: string;
  readonly position: number;
};

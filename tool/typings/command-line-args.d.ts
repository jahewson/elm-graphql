declare module "command-line-args" {
  interface AnyMap {
    [key: string]: any;
  }

  interface OptDef {
    name: string;
    alias?: string;
    type: any;
    multiple?: boolean;
    defaultOption?: boolean;
  }

  interface CmdLineArgsAPI {
    (optdefs: OptDef[], argv?: string[]) : AnyMap;
  }

  var api: CmdLineArgsAPI;
  export = api;
}

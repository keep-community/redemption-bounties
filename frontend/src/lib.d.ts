declare module "rimble-ui";
declare module "@rimble/network-indicator";

interface Window {
    ethereum:
      | {
          enable(): Promise<string[]>;
          selectedAddress: string | null;
          request: (params: { method: string }) => Promise<string[]>;
          chainId: string,
          on(event:string, cb:Function)
        }
      | undefined;
  }
declare module "node:fs/promises" {
  export function mkdir(path:string,opts?:any):Promise<void>;
  export function readFile(path:string,encoding:string):Promise<string>;
  export function rename(oldPath:string,newPath:string):Promise<void>;
  export function writeFile(path:string,data:string,encoding:string):Promise<void>;
}
declare module "node:path" { export function dirname(path:string):string; }

{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/22.05";
    flake-utils.url = "github:numtide/flake-utils";
  };
  outputs = {self, nixpkgs, flake-utils} :
    flake-utils.lib.eachSystem ["x86_64-linux"]
      (system:
        let
          pkgs = import nixpkgs { system = system; };
        in
          {
            devShell = pkgs.mkShell {
              name = "sqltypechecker-env";
              buildInputs = [
                             pkgs.nodejs-18_x
                            ];
            };
          }
      );
}

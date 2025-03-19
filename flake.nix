{
  inputs = {

    nixpkgs.url = "github:NixOS/nixpkgs/24.11";
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
                             pkgs.nodejs_22
                            ];
            };
          }
      );
}

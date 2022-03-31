Huidige plan:

We werken niet meer met positionele parameters (da's toch maar een lapmiddel, niet echt deel van Postgres) maar we gaan enkel functies declareren en die typechecken en daar (typescript) bindings van maken. 

Daarmee weet je dus op voorhand welke parameters je hebt. Let bindings, from's etc, kunnen ook wel dingen in de context steken, maar da's wel beter afgelijnd. Die blocks zorgen er wel voor dat immutable Context's wel een goed idee zijn, zo volgen die de flow meteen mee.

Idealiter zouden we LANGUAGE plpgsql en LANGUAGE sql moeten ondersteunen!
-> Als we beginnen met LANGUAGE sql, dan moeten we (nog) geen parser schrijven!

Type inference:
* Type is mandatory in DECLARE blocks
* Type is mandatory in CREATE FUNCTION parameters
* We kunnen dus aan alle Context.decls meteen een type geven. Enkel nullability heb je niet. 
  * Of wat als we gewoon alle (user-defined) functie parameters not-nullable by default zetten, en je moet "default NULL" meegeven om ze nullable te definiëren? -> Dit is volgens mij eigenlijk het beste, maar het staat redelijk ver af van hoe Postgres het zelf doet. Op zich voor Aperi zou dit wel goed werken... YUP WE GAAN DIT DOEN
    * Oude discussie: 
      * Als we dat immutable willen bijhouden, dan moeten we dus ook weer heel de context de hele tijd meesleuren
      * Als we dat mutable maken, volg je niet meer de volledige control flow, maar da's ook niet echt nodig denk ik want die moeten altijd "kloppen"
        * Oude discussie: Moeten we parameters eerste als nullable, of als not-nullable beschouwen?
          * Indien CALLED ON NULL INPUT (=default): Alles is nullable. (NOPE ZIE VERDER)
          * Indien RETURNS NULL ON NULL INPUT of STRICT: Niks is nullable? . (NOPE ZIE VERDER)
            * Eigenlijk betekent dit: Als je mij ergens een NULL geeft, geef ik NULL terug. De body wordt niet uitgevoerd. Dus inderdaad, je gaat altijd in de function body zelf not-nullable zijn! Als je zo'n functie aanroept kan je echter wel NULL terugkrijgen, als een van de argumenten NULL is. Je kan dat als speciale modifier op die functie bijhouden, en als een van de argumenten nullable is, dan is het return type ook nullable.. (NOPE ZIE VERDER)
            * Optional parameters kunnen we wel nog ondersteunen met "myvar int default NULL". NOPE toch niet, eens STRICT kan je nooit nullable parameters binnenkrijgen. . (NOPE ZIE VERDER)
            * Moeten we een optie voorzien (of gewoon default zo doen) dat input params aan STRICT functions nooit NULL mogen zijn?

TODO:
* interpret + check RETURNS:
  * bvb "int": krijg je echt int terug, geen record
  * "record": krijg je een record met fields terug
  * setof {record,"int"}: krijg je meerdere lijnen terug

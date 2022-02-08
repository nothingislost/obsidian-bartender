## Obsidian Bartender

Take control of your Obsidian workspace by organizing, rearranging, and filtering nav bars, ribbon bars, status bars, and the file explorer.

### File Explorer

#### Filtering

The file explorer can be filtered using fuse.js extended search syntax:

White space acts as an **AND** operator, while a single pipe (`|`) character acts as an **OR** operator. To escape white space, use double quote ex. `="scheme language"` for exact match.

| Token       | Match type                 | Description                            |
| ----------- | -------------------------- | -------------------------------------- |
| `jscript`   | fuzzy-match                | Items that fuzzy match `jscript`       |
| `=scheme`   | exact-match                | Items that are `scheme`                |
| `'python`   | include-match              | Items that include `python`            |
| `!ruby`     | inverse-exact-match        | Items that do not include `ruby`       |
| `^java`     | prefix-exact-match         | Items that start with `java`           |
| `!^erlang` | inverse-prefix-exact-match | Items that do not start with `erlang` |
| `.js$`      | suffix-exact-match         | Items that end with `.js`              |
| `!.go$`     | inverse-suffix-exact-match | Items that do not end with `.go`       |

White space acts as an **AND** operator, while a single pipe (`|`) character acts as an **OR** operator.

### Installing the plugin using BRAT

1. Install the BRAT plugin
    1. Open `Settings` -> `Community Plugins`
    2. Disable safe mode, if enabled
    3. *Browse*, and search for "BRAT" 
    4. Install the latest version of **Obsidian 42 - BRAT**
2. Open BRAT settings (`Settings` -> `Obsidian 42 - BRAT`)
    1. Scroll to the `Beta Plugin List` section
    2. `Add Beta Plugin`
    3. Specify this repository: `nothingislost/obsidian-bartender`
3. Enable the `Bartender` plugin (`Settings` -> `Community Plugins`)

### Manually installing the plugin

- Copy over `main.js`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/obsidian-bartender/`.

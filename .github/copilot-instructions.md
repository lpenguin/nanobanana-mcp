# GitHub Copilot Instructions

## Commit Message Guidelines

This project follows the [Conventional Commits](https://www.conventionalcommits.org/) specification for commit messages.

### Commit Message Format

Each commit message should be structured as follows:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that do not affect the meaning of the code (white-space, formatting, etc)
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **perf**: A code change that improves performance
- **test**: Adding missing tests or correcting existing tests
- **build**: Changes that affect the build system or external dependencies
- **ci**: Changes to CI configuration files and scripts
- **chore**: Other changes that don't modify src or test files
- **revert**: Reverts a previous commit

### Examples

```
feat: add image rotation support
fix: resolve memory leak in image processing
docs: update README with new API examples
ci: configure automated npm publishing
```

### Breaking Changes

Breaking changes should be indicated by adding `BREAKING CHANGE:` in the commit footer, or by appending `!` after the type/scope:

```
feat!: remove deprecated aspectRatio parameter
```

### Best Practices

- Use the imperative mood in the subject line (e.g., "add" not "added" or "adds")
- Capitalize the first letter of the description
- Do not end the subject line with a period
- Limit the subject line to 50 characters when possible
- Separate subject from body with a blank line
- Use the body to explain what and why vs. how
- Reference issues and pull requests in the footer

This helps with:
- Automated version bumping
- Automated changelog generation
- Better understanding of project history

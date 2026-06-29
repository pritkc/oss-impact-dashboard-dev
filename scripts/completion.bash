# Shell completion for build commands. Usage: source scripts/completion.bash
#
# Completes project YAML paths after --projects for npm run build:data/build:ui/build:site.

_oss_dashboard_project_files() {
  compgen -W "$(find projects -maxdepth 1 -name '*.yml' -print 2>/dev/null | sort)" -- "$1"
}

_oss_dashboard_build_complete() {
  local current previous
  current="${COMP_WORDS[COMP_CWORD]}"
  previous="${COMP_WORDS[COMP_CWORD - 1]}"

  if [[ "$previous" == "--projects" || "$previous" == "--default-project" ]]; then
    COMPREPLY=( $(_oss_dashboard_project_files "$current") )
    return
  fi

  if [[ "$current" == --* ]]; then
    COMPREPLY=( $(compgen -W "--projects --default-project --from-cache --output-dir --manual-root --safe-project" -- "$current") )
    return
  fi

  COMPREPLY=( $(_oss_dashboard_project_files "$current") )
}

complete -F _oss_dashboard_build_complete npm
complete -F _oss_dashboard_build_complete python

_oss_dashboard_cli_complete() {
  local current previous
  current="${COMP_WORDS[COMP_CWORD]}"
  previous="${COMP_WORDS[COMP_CWORD - 1]}"

  if [[ "${COMP_WORDS[1]}" == "build-index" && "$previous" == "--projects" ]]; then
    COMPREPLY=( $(_oss_dashboard_project_files "$current") )
  fi
}

complete -F _oss_dashboard_cli_complete python

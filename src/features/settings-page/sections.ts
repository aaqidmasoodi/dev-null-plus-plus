/**
 * A block on the settings page: a heading, a short description and the controls under it, like each block on
 * dev-null.sh's own settings pages. Features add their settings by contributing a section.
 */
export interface SettingsSection {
  id: string;
  title: string;
  description: string;
  render: () => Node;
}

export interface Field {
  label: string;
  value: Node | string;
  mono?: boolean;
}

/** A bordered list of label and value rows, as on the Profile settings page. */
export function createFieldList(fields: readonly Field[]): HTMLDListElement {
  const list = document.createElement('dl');

  for (const field of fields) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const value = document.createElement('dd');

    term.textContent = field.label;
    value.append(field.value);

    if (field.mono === true) {
      value.className = 'mono';
    }

    row.append(term, value);
    list.append(row);
  }

  return list;
}

export function aboutSection(version: string): SettingsSection {
  return {
    id: 'about',
    title: 'About',
    description: 'Extra powers for /dev/null. There is nothing to set up: new features appear here as they ship.',
    render: () => {
      const status = document.createElement('span');
      const dot = document.createElement('span');

      status.className = 'status';
      dot.className = 'dot';
      dot.setAttribute('aria-hidden', 'true');
      status.append(dot, 'Installed and running');

      return createFieldList([
        { label: 'status', value: status },
        { label: 'version', value: `v${version}`, mono: true },
        { label: 'data', value: 'Stays in your browser' },
      ]);
    },
  };
}

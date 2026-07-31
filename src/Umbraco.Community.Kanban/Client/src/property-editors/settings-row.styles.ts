import { css } from '@umbraco-cms/backoffice/external/lit';

/**
 * The row shell shared by the appearance editors — manual lanes and lane/category overrides. They
 * edit different things (one invents lane values, the other decorates resolved ones) but they sit in
 * the same settings list and must read as one control, so the shell lives here rather than being
 * written a second time.
 *
 * `.identity` is whatever names the row: an input in the manual editor, static text in the overrides
 * one. It takes the free space so the row's trailing controls line up down the list either way.
 * Deliberately only sizing — an editor whose identity is a `uui-input` must not have a display
 * imposed on it, since that is the containing box for the input's own shadow content.
 */
export const kanbanSettingsRowStyles = css`
  .row {
    display: flex;
    align-items: center;
    gap: var(--uui-size-space-4);
    padding: var(--uui-size-space-2) 0;
    border-bottom: 1px solid var(--uui-color-divider);
  }

  .identity {
    flex: 1;
    min-width: 0;
  }

  .drag-handle {
    cursor: grab;
    color: var(--uui-color-text-alt);
  }

  /* Grouped so they stay together at the row's end, whatever the row holds before them. */
  .actions {
    display: flex;
    gap: var(--uui-size-space-1);
  }
`;

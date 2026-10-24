// The Salvage Yard design system for React (R-96): every component, one import, by layer (atomic
// design, spec 076: atoms → molecules → organisms, layout beside them). Pages and features import
// from here only. Rules: skill `frontend-architecture` (the code) and `mudpuppy-react-ui` (pages).

// --- atoms: one element ----------------------------------------------------------------------
export { Anchor, LinkProvider, type AnchorProps, type DrawLink } from './atoms/Anchor.js';
export { Button, LinkButton, type ButtonProps, type ButtonVariant, type LinkButtonProps } from './atoms/Button.js';
export { Check, Input, Select, Textarea, type CheckProps } from './atoms/Controls.js';
export { Chip, type ChipProps } from './atoms/Chip.js';
export { Code } from './atoms/Code.js';
export { Count } from './atoms/Count.js';
export { Note, type NoteProps } from './atoms/Note.js';
export { Prose, type ProseProps } from './atoms/Prose.js';
export { Status, type StatusProps } from './atoms/Status.js';
export { Tag, Tags, type TagProps } from './atoms/Tag.js';
export { SrOnly, SubHead, Text, type TextProps } from './atoms/Text.js';

// --- layout: spacing and arrangement, through the token utilities -------------------------------
export { Box, type BoxProps, type Space, type Surface, type Tone } from './layout/Box.js';
export { Cluster, Columns, Grid, Split, Stack } from './layout/Layout.js';

// --- molecules: a few atoms with one job --------------------------------------------------------
export { Callout, type CalloutProps } from './molecules/Callout.js';
export { Choice, Kbd, KeyBar, type ChoiceProps } from './molecules/Choice.js';
export { Disclosure, type DisclosureProps } from './molecules/Disclosure.js';
export { Facts } from './molecules/Facts.js';
export { Field, Fieldset, type FieldProps } from './molecules/Field.js';
export { HeaderPicker, StoreMark, type HeaderPickerProps } from './molecules/HeaderPicker.js';
export { Busy, Loader, Reserve, type BusyProps, type LoaderProps, type ReserveProps } from './molecules/Loader.js';
export { Menu, type MenuEntry, type MenuItemSpec, type MenuProps } from './molecules/Menu.js';
export { Meter, type MeterProps } from './molecules/Meter.js';
export { PageHead, PageHeadProvider, type CameFrom, type Crumb, type PageHeadProps, type PageHeadWiring } from './molecules/PageHead.js';
export { Pager, type PagerProps, type PagerStep } from './molecules/Pager.js';
export { Path, type PathStep } from './molecules/Path.js';
export { ScanId, shortScanId, type ScanIdProps } from './molecules/ScanId.js';
export { SearchBox, type SearchBoxProps } from './molecules/SearchBox.js';
export { RowPicture, type RowPictureProps } from './molecules/RowPicture.js';
export { Segmented, type SegmentedProps, type SegmentItem } from './molecules/Segmented.js';
export { State, type StateProps } from './molecules/State.js';
export { Steps, type Step } from './molecules/Steps.js';
export { TabPanel, Tabs, ViewNav, type TabItem, type TabsProps, type ViewNavProps } from './molecules/Tabs.js';

// --- organisms: regions of a page with their own structure --------------------------------------
export { AppShell, type AppShellProps, type NavGroup, type NavItem } from './organisms/AppShell.js';
export {
  ChatDivider,
  ChatLog,
  Chips,
  Composer,
  Drawer,
  Message,
  ProposalCard,
  Vault,
  type DrawerProps,
  type MessageProps,
  type ProposalCardProps,
} from './organisms/Chat.js';
export { CommandCard, type CommandCardProps } from './organisms/CommandCard.js';
export { Compare, CompareOverlay, CompareSide, type CompareOverlayProps, type CompareSideProps } from './organisms/Compare.js';
export { Confirm, type ConfirmProps } from './organisms/Confirm.js';
export { DecisionTable, type DecisionRow, type DecisionTableProps } from './organisms/DecisionTable.js';
export { Diagram, drawable, type DiagramProps } from './organisms/Diagram.js';
export { Dialog, type DialogProps } from './organisms/Dialog.js';
export { GenFeedback, GenView, type GenFeedbackProps, type GenViewProps, type GenWhy } from './organisms/GenView.js';
export {
  Bundle,
  Graph,
  GraphNode,
  Legend,
  type GraphEdge,
  type GraphNodeProps,
  type GraphProps,
  type LegendProps,
} from './organisms/Graph.js';
export { PhaseBar, PhaseKey, type BarPhase, type PhaseBarProps } from './organisms/PhaseBar.js';
export { Picture, type PictureItem, type PictureProps } from './organisms/Picture.js';
export { Plate, type PlateProps } from './organisms/Plate.js';
export { PictureBrowser, type BrowseItem, type BrowsePick, type BrowseVariant, type PictureBrowserProps } from './organisms/PictureBrowser.js';
export { RecordingDialog, type RecordingDialogProps } from './organisms/RecordingDialog.js';
export { Releases, type ReleaseLane, type ReleaseScan, type ReleaseSpan, type ReleasesProps } from './organisms/Releases.js';
export { Row, Rows, type RowProps } from './organisms/Rows.js';
export { Shot, type ShotGone, type ShotProps, type ShotRegion } from './organisms/Shot.js';
export { Skeleton, type SkeletonProps } from './organisms/Skeleton.js';
export { SelectionBar, SortGrid, type PickItem, type SortGridProps } from './organisms/SortGrid.js';
export { Table, type Column, type TableProps } from './organisms/Table.js';
export { Timeline, TimelineItem, type TimelineItemProps } from './organisms/Timeline.js';
export { Variant, Variants, type VariantProps } from './organisms/Variants.js';
export {
  Film,
  FilmItem,
  LiveBar,
  Mini,
  Narration,
  PathSwitch,
  Sheet,
  Suggestions,
  WbLayout,
  type FilmItemProps,
  type NarrationLine,
  type PathSwitchProps,
} from './organisms/WbParts.js';
export { thinTicks, useBoxWidth, type AxisTick } from './organisms/axis.js';

// --- shared --------------------------------------------------------------------------------------
export { STATUS_WORD, STATUSES, type StatusKind } from './status.js';
export { cx } from './cx.js';

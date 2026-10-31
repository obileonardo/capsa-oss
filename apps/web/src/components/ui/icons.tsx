/* Icons for the whole app: Lucide (ISC), behind one shim with the lucide-react export names, so screens import from
 * here and every icon gets the same treatment: one size system and one stroke (refinement pass, 22 Oct).
 *   16 px in the UI (default) · 14 px for chevrons and inline meta · 20 px for right-panel detail tiles · stroke 1.75
 * The size comes from CSS (--pi on the icon or an ancestor), so call sites can't drift; a `size` prop snaps to the
 * nearest of the three. (The Pixel style and its pixel icons were removed from the app; they're archived in
 * design-references/design-system/.) */
import * as L from 'lucide-react';
import { forwardRef, type ForwardRefExoticComponent, type RefAttributes, type SVGProps } from 'react';
import { GLYPHS, ICON_GLYPH } from './brand-icons.gen';
import { GlyphSvg } from './Glyph';

export interface IconProps extends SVGProps<SVGSVGElement> { size?: number | string; strokeWidth?: number | string; absoluteStrokeWidth?: boolean }
export type LucideIcon = ForwardRefExoticComponent<Omit<IconProps, 'ref'> & RefAttributes<SVGSVGElement>>;

/** The three sizes: 14 (chevrons, inline meta), 16 (UI), 20 (detail tiles). */
const snap = (n: number) => (n <= 14 ? 14 : n <= 17 ? 16 : 20);

/** Each export renders its brand glyph (design-references/brand/icons/glyph/{solid,line}/, via brand-icons.gen.ts) once one
 * exists for its name, and the Lucide icon until then. Same props, size system, data-ic and aria behaviour either way. The
 * glyph carries both drawings and follows Settings > Appearance > Icon style through <html data-icons> (see Glyph.tsx). */
function icon(Lucide: L.LucideIcon, name: string, extra?: { fill?: string }): LucideIcon {
  const C = forwardRef<SVGSVGElement, IconProps>(({ size, className, style, strokeWidth: _s, absoluteStrokeWidth: _a, ...rest }, ref) => {
    const glyph = ICON_GLYPH[name] ?? (GLYPHS[name] ? name : undefined);
    const common = {
      className: className ? `pi ${className}` : 'pi', 'data-ic': name, 'aria-hidden': rest['aria-label'] ? undefined : true,
      style: size === undefined ? style : { ...style, ['--pi' as string]: `${snap(Number(size))}px` },
    };
    if (glyph) {
      const { fill: _f, color: _c, ...svgRest } = rest as SVGProps<SVGSVGElement>;
      return <GlyphSvg ref={ref} name={glyph} {...common} {...svgRest} />;
    }
    return <Lucide ref={ref} {...common} strokeWidth={1.75} absoluteStrokeWidth={false} {...(extra?.fill ? { fill: extra.fill } : {})} {...(rest as object)} />;
  });
  C.displayName = `Icon(${name})`;
  return C;
}

export const Activity = icon(L.Activity, 'activity');
export const AlignCenter = icon(L.AlignCenter, 'align-center');
export const AlignJustify = icon(L.AlignJustify, 'align-justify');
export const AlignLeft = icon(L.AlignLeft, 'align-left');
export const AlignRight = icon(L.AlignRight, 'align-right');
export const AppWindow = icon(L.AppWindow, 'app-window');
export const Archive = icon(L.Archive, 'archive');
export const ArrowDownAZ = icon(L.ArrowDownAZ, 'arrow-down-a-z');
export const ArrowDown = icon(L.ArrowDown, 'arrow-down');
export const ArrowLeft = icon(L.ArrowLeft, 'arrow-left');
export const ArrowRight = icon(L.ArrowRight, 'arrow-right');
export const ArrowUp = icon(L.ArrowUp, 'arrow-up');
export const ArrowUpRight = icon(L.ArrowUpRight, 'arrow-up-right');
export const AtSign = icon(L.AtSign, 'at-sign');
export const BadgeCheck = icon(L.BadgeCheck, 'badge-check');
export const Bell = icon(L.Bell, 'bell');
export const Blocks = icon(L.Blocks, 'blocks');
export const BookOpen = icon(L.BookOpen, 'book-open');
export const Bookmark = icon(L.Bookmark, 'bookmark');
export const BookmarkFilled = icon(L.Bookmark, 'bookmark-filled', { fill: 'currentColor' });
export const PanelRightOpen = icon(L.PanelRightOpen, 'panel-right-open');
export const Bot = icon(L.Bot, 'bot');
export const Braces = icon(L.Braces, 'braces');
export const Briefcase = icon(L.Briefcase, 'briefcase');
export const Check = icon(L.Check, 'check');
export const CheckCheck = icon(L.CheckCheck, 'check-check');
export const ChevronDown = icon(L.ChevronDown, 'chevron-down');
export const ChevronLeft = icon(L.ChevronLeft, 'chevron-left');
export const ChevronRight = icon(L.ChevronRight, 'chevron-right');
export const ChevronsDownUp = icon(L.ChevronsDownUp, 'chevrons-down-up');
export const ChevronsUpDown = icon(L.ChevronsUpDown, 'chevrons-up-down');
export const CircleAlert = icon(L.CircleAlert, 'circle-alert');
export const CircleDashed = icon(L.CircleDashed, 'circle-dashed');
export const CircleHelp = icon(L.CircleHelp, 'circle-help');
export const CircleOff = icon(L.CircleOff, 'circle-off');
export const ClipboardCopy = icon(L.ClipboardCopy, 'clipboard-copy');
export const ClipboardPaste = icon(L.ClipboardPaste, 'clipboard-paste');
export const Clock = icon(L.Clock, 'clock');
export const Clock3 = icon(L.Clock3, 'clock-3');
export const Code2 = icon(L.Code2, 'code-2');
export const CodeXml = icon(L.CodeXml, 'code-xml');
export const Columns2 = icon(L.Columns2, 'columns-2');
export const Command = icon(L.Command, 'command');
export const Copy = icon(L.Copy, 'copy');
export const CornerDownLeft = icon(L.CornerDownLeft, 'corner-down-left');
export const Crop = icon(L.Crop, 'crop');
export const Download = icon(L.Download, 'download');
export const Eraser = icon(L.Eraser, 'eraser');
export const ExternalLink = icon(L.ExternalLink, 'external-link');
export const Eye = icon(L.Eye, 'eye');
export const FileCode2 = icon(L.FileCode2, 'file-code-2');
export const FileImage = icon(L.FileImage, 'file-image');
export const FileQuestion = icon(L.FileQuestion, 'file-question');
export const FileText = icon(L.FileText, 'file-text');
export const FlaskConical = icon(L.FlaskConical, 'flask-conical');
export const Folder = icon(L.Folder, 'folder');
export const FolderGit2 = icon(L.FolderGit2, 'folder-git-2');
export const FolderKanban = icon(L.FolderKanban, 'folder-kanban');
export const FolderPlus = icon(L.FolderPlus, 'folder-plus');
export const GitBranch = icon(L.GitBranch, 'git-branch');
export const Gift = icon(L.Gift, 'gift');
export const Globe = icon(L.Globe, 'globe');
export const GraduationCap = icon(L.GraduationCap, 'graduation-cap');
export const GripVertical = icon(L.GripVertical, 'grip-vertical');
export const Hand = icon(L.Hand, 'hand');
export const HardDrive = icon(L.HardDrive, 'hard-drive');
export const History = icon(L.History, 'history');
export const Image = icon(L.Image, 'image');
export const ImageOff = icon(L.ImageOff, 'image-off');
export const ImagePlus = icon(L.ImagePlus, 'image-plus');
export const Inbox = icon(L.Inbox, 'inbox');
export const Info = icon(L.Info, 'info');
export const Layers = icon(L.Layers, 'layers');
export const LayoutGrid = icon(L.LayoutGrid, 'layout-grid');
export const Library = icon(L.Library, 'library');
export const LibraryBig = icon(L.LibraryBig, 'library-big');
export const Loader = icon(L.Loader, 'loader');
export const Lightbulb = icon(L.Lightbulb, 'lightbulb');
export const Link = icon(L.Link, 'link');
export const Link2 = icon(L.Link2, 'link-2');
export const Link2Off = icon(L.Link2Off, 'link-2-off');
export const List = icon(L.List, 'list');
export const ListChecks = icon(L.ListChecks, 'list-checks');
export const MapPin = icon(L.MapPin, 'map-pin');
export const Maximize2 = icon(L.Maximize2, 'maximize-2');
export const Menu = icon(L.Menu, 'menu');
export const MessageCircle = icon(L.MessageCircle, 'message-circle');
export const MessageSquareReply = icon(L.MessageSquareReply, 'message-square-reply');
export const MessageSquareText = icon(L.MessageSquareText, 'message-square-text');
export const Monitor = icon(L.Monitor, 'monitor');
export const MonitorDown = icon(L.MonitorDown, 'monitor-down');
export const Moon = icon(L.Moon, 'moon');
export const MoreHorizontal = icon(L.MoreHorizontal, 'more-horizontal');
export const MousePointer = icon(L.MousePointer, 'mouse-pointer');
export const Newspaper = icon(L.Newspaper, 'newspaper');
export const PanelLeft = icon(L.PanelLeft, 'panel-left');
export const PanelLeftDashed = icon(L.PanelLeftDashed, 'panel-left-dashed');
export const PanelRight = icon(L.PanelRight, 'panel-right');
export const Paperclip = icon(L.Paperclip, 'paperclip');
export const Pause = icon(L.Pause, 'pause');
export const PenLine = icon(L.PenLine, 'pen-line');
export const Pencil = icon(L.Pencil, 'pencil');
export const Highlighter = icon(L.Highlighter, 'highlighter');
export const Marker = icon(L.PenTool, 'marker');
export const ArrowCurved = icon(L.Redo2, 'arrow-curved');
export const ArrowElbow = icon(L.CornerDownRight, 'arrow-elbow');
export const Play = icon(L.Play, 'play');
export const Plug = icon(L.Plug, 'plug');
export const Plus = icon(L.Plus, 'plus');
export const Radio = icon(L.Radio, 'radio');
export const Quote = icon(L.Quote, 'quote');
export const Repeat = icon(L.Repeat, 'repeat');
export const RotateCcw = icon(L.RotateCcw, 'rotate-ccw');
export const RotateCw = icon(L.RotateCw, 'rotate-cw');
export const Rows3 = icon(L.Rows3, 'rows-3');
export const ScanText = icon(L.ScanText, 'scan-text');
export const Search = icon(L.Search, 'search');
export const SearchX = icon(L.SearchX, 'search-x');
export const Settings = icon(L.Settings, 'settings');
export const Shapes = icon(L.Shapes, 'shapes');
export const Share = icon(L.Share, 'share');
export const ShieldAlert = icon(L.ShieldAlert, 'shield-alert');
export const ShieldCheck = icon(L.ShieldCheck, 'shield-check');
export const Shuffle = icon(L.Shuffle, 'shuffle');
export const SlidersHorizontal = icon(L.SlidersHorizontal, 'sliders-horizontal');
export const Sparkles = icon(L.Sparkles, 'sparkles');
export const SquareDashed = icon(L.SquareDashed, 'square-dashed');
export const SquareDashedMousePointer = icon(L.SquareDashedMousePointer, 'square-dashed-mouse-pointer');
export const SquarePen = icon(L.SquarePen, 'square-pen');
export const SquarePlay = icon(L.SquarePlay, 'square-play');
export const Star = icon(L.Star, 'star');
export const StarFilled = icon(L.Star, 'star-filled', { fill: 'currentColor' });
export const Dots = icon(L.Ellipsis, 'dots');
export const SquareStack = icon(L.SquareStack, 'square-stack');
export const SquareTerminal = icon(L.SquareTerminal, 'square-terminal');
export const StepBack = icon(L.StepBack, 'step-back');
export const StepForward = icon(L.StepForward, 'step-forward');
export const StickyNote = icon(L.StickyNote, 'sticky-note');
export const Sun = icon(L.Sun, 'sun');
export const SwatchBook = icon(L.SwatchBook, 'swatch-book');
export const Tag = icon(L.Tag, 'tag');
export const Target = icon(L.Target, 'target');
export const TextCursorInput = icon(L.TextCursorInput, 'text-cursor-input');
export const TextQuote = icon(L.TextQuote, 'text-quote');
export const Trash2 = icon(L.Trash2, 'trash-2');
export const TriangleAlert = icon(L.TriangleAlert, 'triangle-alert');
export const Type = icon(L.Type, 'type');
export const Undo2 = icon(L.Undo2, 'undo-2');
export const Upload = icon(L.Upload, 'upload');
export const UserRound = icon(L.UserRound, 'user-round');
export const UserPlus = icon(L.UserPlus, 'user-plus');
export const Users = icon(L.Users, 'users');
export const Video = icon(L.Video, 'video');
export const Volume2 = icon(L.Volume2, 'volume-2');
export const VolumeX = icon(L.VolumeX, 'volume-x');
export const Wand2 = icon(L.Wand2, 'wand-2');
export const WifiOff = icon(L.WifiOff, 'wifi-off');
export const Workflow = icon(L.Workflow, 'workflow');
export const Wrench = icon(L.Wrench, 'wrench');
export const X = icon(L.X, 'x');

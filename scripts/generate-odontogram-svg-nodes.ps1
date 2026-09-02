#Requires -Version 5.1
<#
.SYNOPSIS
  Generates the reviewed, checked-in React node tree for the odontogram anatomy.

.DESCRIPTION
  Author-time generator for `src/components/odontogram/generated/measured-svg-nodes.ts`.

  The EMR must never fetch or parse SVG text at runtime. This script reads the
  pinned, repository-owned measured assets once, validates every element,
  attribute and CSS declaration against a closed allowlist, and emits a plain
  immutable data structure that runtime code renders through
  `React.createElement`. The emitted file contains no markup and no executable
  text.

  Security posture:
    * The XML reader prohibits DTDs and resolves no external entities.
    * Only the allow-listed SVG elements/attributes/CSS properties survive.
    * Script elements, `on*` handlers, `href`/`xlink:href` and any non-local
      `url(...)` reference abort the run.
    * Every source file's SHA-256 (LF-normalised) is recorded so a test can
      fail when an asset changes without a reviewed regeneration.

  Input and output paths are rooted in this repository. The neighbouring
  controlled-fork working checkout is never read.

.EXAMPLE
  pwsh -File scripts/generate-odontogram-svg-nodes.ps1
#>
[CmdletBinding()]
param(
  [string] $AssetDirectory,
  [string] $OutputFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
if (-not $AssetDirectory) {
  $AssetDirectory = Join-Path $repositoryRoot 'src/components/odontogram/assets/measured'
}
if (-not $OutputFile) {
  $OutputFile = Join-Path $repositoryRoot 'src/components/odontogram/generated/measured-svg-nodes.ts'
}

# --- Provenance -------------------------------------------------------------
# Controlled fork: https://github.com/Ditherys/React-Odontogram-Modul
$ForkCommit = '5e28d931feefe4c3382513dbb0f5a9db9cf9948c'
$ForkAssetPath = 'src/assets/teeth-svgs/measured'
$GeneratorVersion = '1'

# --- Closed allowlists ------------------------------------------------------
$AllowedElements = [System.Collections.Generic.HashSet[string]]::new(
  [string[]]@('svg', 'defs', 'g', 'path', 'polygon', 'polyline', 'line', 'circle', 'ellipse',
    'linearGradient', 'radialGradient', 'stop'))

# Elements dropped on sight. `style` carries the fork's single
# `[data-active="0"] { display: none; }` rule, which this repository owns in
# `src/components/odontogram/styles.css` instead of re-emitting per asset.
$DroppedElements = [System.Collections.Generic.HashSet[string]]::new([string[]]@('style'))

# Geometry / paint attributes, mapped to their React DOM property name.
$AllowedAttributes = [ordered]@{
  'viewBox'           = 'viewBox'
  'd'                 = 'd'
  'points'            = 'points'
  'x1'                = 'x1'
  'y1'                = 'y1'
  'x2'                = 'x2'
  'y2'                = 'y2'
  'cx'                = 'cx'
  'cy'                = 'cy'
  'fx'                = 'fx'
  'fy'                = 'fy'
  'r'                 = 'r'
  'rx'                = 'rx'
  'ry'                = 'ry'
  'transform'         = 'transform'
  'gradientTransform' = 'gradientTransform'
  'gradientUnits'     = 'gradientUnits'
  'offset'            = 'offset'
  'stop-color'        = 'stopColor'
  'stop-opacity'      = 'stopOpacity'
}

# Author-time metadata the fork records on the root element. Preserved because
# later clinical work (bridge saddles, implant platforms) measures against it.
$AllowedDataAttributes = [System.Collections.Generic.HashSet[string]]::new(
  [string[]]@('data-tooth-template', 'data-root-count', 'data-cej-y', 'data-cervical-left',
    'data-cervical-right', 'data-crown-left', 'data-crown-right', 'data-implant-platform-y',
    'data-implant-left', 'data-implant-right', 'data-bridge-anchor-y', 'data-bridge-anchor-height',
    'data-furcation-y', 'data-cusp-count', 'data-groove-pattern', 'data-toothgen-anatomy'))

# Attributes consumed by the generator rather than emitted verbatim.
$ControlAttributes = [System.Collections.Generic.HashSet[string]]::new(
  [string[]]@('id', 'style', 'data-active', 'xmlns', 'version'))

# CSS declarations allowed inside a `style` attribute, with their React key.
$AllowedStyleProperties = [ordered]@{
  'fill'              = 'fill'
  'stroke'            = 'stroke'
  'stroke-width'      = 'strokeWidth'
  'stroke-miterlimit' = 'strokeMiterlimit'
  'stroke-linecap'    = 'strokeLinecap'
  'stroke-linejoin'   = 'strokeLinejoin'
  'paint-order'       = 'paintOrder'
  'opacity'           = 'opacity'
  'isolation'         = 'isolation'
  'display'           = 'display'
}

# --- Dynamic layer registry -------------------------------------------------
# Ported from the controlled fork's `src/registry/svgLayers.ts`
# (FIXED_CLEAR_LAYERS + the composed restoration layers) at commit 5e28d93.
# These ids are renderer-controlled: the generator strips their authored
# `display` declaration and marks them so the runtime supplies `data-active`.
# Everything else keeps its authored attributes verbatim.
$DynamicLayerIds = [System.Collections.Generic.HashSet[string]]::new([string[]]@(
    # tooth body / pulp / milk tooth / wear
    'tooth-base', 'tooth-healthy-pulp', 'tooth-inflam-pulp', 'tooth-bruxism-wear', 'tooth-bruxism-neck-wear',
    'tooth-base-beauty', 'milktooth', 'milktooth-base', 'milktooth-beauty', 'milktooth-healthy-pulp',
    'milktooth-inflam-pulp',
    # baseline anatomy the clinician may hide (EMR display preference, not a
    # fork-authored clinical layer)
    'bone-base', 'gum-base',
    # tooth variants
    'tooth-broken-incisal', 'tooth-broken-distal-incisal', 'tooth-broken-distal',
    'tooth-broken-mesial-distal-incisal', 'tooth-broken-mesial-distal', 'tooth-broken-mesial-incisal',
    'tooth-broken-mesial', 'tooth-crownprep', 'tooth-under-gum', 'tooth-radix',
    'no-tooth-after-extraction', 'missing-closed',
    # periapical / periodontal modifiers
    'inflammation', 'parodontal', 'mobility', 'cysta', 'granuloma', 'abscess', 'calculus',
    # endodontics
    'endo-medical-filling', 'endo-filling', 'endo-filling-incomplete', 'endo-glass-pin', 'endo-metal-pin',
    'endo-resection', 'endo-resorption', 'parapulpal-pin',
    # caries and sub-caries
    'caries-root', 'caries-subcrown', 'caries-buccal', 'caries-lingual', 'caries-mesial', 'caries-distal',
    'caries-occlusal',
    'subcaries-buccal', 'subcaries-lingual', 'subcaries-mesial', 'subcaries-distal', 'subcaries-occlusal',
    # direct fillings and their defect markers
    'filling-amalgam-buccal', 'filling-amalgam-lingual', 'filling-amalgam-mesial', 'filling-amalgam-distal',
    'filling-amalgam-occlusal',
    'filling-composite-buccal', 'filling-composite-lingual', 'filling-composite-mesial',
    'filling-composite-distal', 'filling-composite-occlusal',
    'filling-gic-buccal', 'filling-gic-lingual', 'filling-gic-mesial', 'filling-gic-distal',
    'filling-gic-occlusal',
    'filling-temporary-buccal', 'filling-temporary-lingual', 'filling-temporary-mesial',
    'filling-temporary-distal', 'filling-temporary-occlusal',
    'defect-buccal', 'defect-lingual', 'defect-mesial', 'defect-distal', 'defect-occlusal',
    # surfaces / contacts / sealing
    'fissure-sealing', 'fissure-sealing-occlusal', 'mesial-no-contact-point', 'distal-no-contact-point',
    # implants and prostheses
    'implant', 'implant-base', 'implant-connector', 'implant-healing-abutment', 'implant-locator-screw',
    'implant-bar', 'peri-implant-bone-loss', 'prosthesis', 'prosthesis-connector', 'prosthesis-crown',
    'prosthesis-implant', 'prosthesis-implant-crown', 'prosthesis-implant-gum',
    # restoration material groups
    'emax', 'gold', 'gradia', 'zircon', 'metal', 'metal-ceramic', 'telescope', 'temporary-restorations',
    # composed restoration layers
    'emax-crown', 'gold-crown', 'gradia-crown', 'zircon-crown', 'metal-crown', 'metal-ceramic-crown',
    'temporary-crown', 'telescope-crown', 'telescope-crown-inside', 'telescope-crown-outside',
    'emax-bridge-connector', 'gold-bridge-connector', 'gradia-bridge-connector', 'zircon-bridge-connector',
    'metal-bridge-connector', 'metal-ceramic-bridge-connector', 'temporary-bridge-connector',
    'telescope-bridge-connector',
    'emax-inlay', 'gold-inlay', 'gradia-inlay', 'zircon-inlay', 'temporary-inlay',
    'emax-onlay', 'gold-onlay', 'gradia-onlay', 'zircon-onlay', 'temporary-onlay',
    'emax-veneer', 'gold-veneer', 'gradia-veneer', 'zircon-veneer', 'temporary-veneer',
    'crown-leakage',
    # orthodontics
    'ortho-bracket', 'ortho-ring', 'arrow-mesial', 'arrow-distal', 'arrow-up', 'arrow-down', 'arrow-rotation',
    # planned-treatment glyphs
    'extraction-plan', 'crown-needed', 'crown-replace',
    # Local addition (not in the fork clear list): the `specials` fracture
    # artwork is authored `display:none` and the fork never activates it. The
    # EMR carries a canonical FRACTURE code, so both glyphs become renderer
    # controlled here. Recorded in docs/ODONTOGRAM_FORK_SOURCE_MANIFEST.md.
    'fracture-vertical', 'fracture-horizontal'
  ))

# --- Helpers ----------------------------------------------------------------
function Assert-Safe {
  param([bool] $Condition, [string] $Message)
  if (-not $Condition) { throw "Odontogram asset rejected: $Message" }
}

function ConvertTo-TsString {
  param([string] $Value)
  $sb = [System.Text.StringBuilder]::new($Value.Length + 8)
  [void]$sb.Append('"')
  foreach ($ch in $Value.ToCharArray()) {
    switch ($ch) {
      '"' { [void]$sb.Append('\"'); continue }
      '\' { [void]$sb.Append('\\'); continue }
      "`n" { [void]$sb.Append('\n'); continue }
      "`r" { [void]$sb.Append('\r'); continue }
      "`t" { [void]$sb.Append('\t'); continue }
      default {
        if ([int]$ch -lt 32 -or [int]$ch -gt 126) {
          [void]$sb.AppendFormat('\u{0:x4}', [int]$ch)
        }
        else { [void]$sb.Append($ch) }
      }
    }
  }
  [void]$sb.Append('"')
  return $sb.ToString()
}

function Get-NormalisedSha256 {
  param([string] $Path)
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $text = [System.Text.Encoding]::UTF8.GetString($bytes)
  $text = $text -replace "`r`n", "`n"
  $normalised = [System.Text.Encoding]::UTF8.GetBytes($text)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    return -join ($sha.ComputeHash($normalised) | ForEach-Object { $_.ToString('x2') })
  }
  finally { $sha.Dispose() }
}

function Read-SecureSvgDocument {
  param([string] $Path)
  $settings = New-Object System.Xml.XmlReaderSettings
  $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
  $settings.XmlResolver = $null
  $settings.IgnoreComments = $true
  $settings.IgnoreProcessingInstructions = $true
  $settings.IgnoreWhitespace = $true
  $settings.MaxCharactersFromEntities = 0
  $settings.CloseInput = $true

  $stream = [System.IO.File]::OpenRead($Path)
  $reader = [System.Xml.XmlReader]::Create($stream, $settings)
  try {
    $document = New-Object System.Xml.XmlDocument
    $document.XmlResolver = $null
    $document.Load($reader)
    return $document
  }
  finally { $reader.Dispose() }
}

function Convert-StyleAttribute {
  param([string] $Value, [bool] $IsDynamicLayer, [string] $Context)
  $result = [ordered]@{}
  foreach ($declaration in $Value.Split(';')) {
    $trimmed = $declaration.Trim()
    if (-not $trimmed) { continue }
    $split = $trimmed.IndexOf(':')
    Assert-Safe ($split -gt 0) "$Context has a malformed style declaration"
    $property = $trimmed.Substring(0, $split).Trim().ToLowerInvariant()
    $propertyValue = $trimmed.Substring($split + 1).Trim()
    Assert-Safe ($AllowedStyleProperties.Contains($property)) "$Context uses disallowed CSS property '$property'"
    Assert-Safe (-not ($propertyValue -match '(?i)expression\s*\(|javascript:|@import')) "$Context has an unsafe CSS value"
    foreach ($match in [regex]::Matches($propertyValue, '(?i)url\(\s*([^)]*)\s*\)')) {
      $target = $match.Groups[1].Value.Trim().Trim("'", '"')
      Assert-Safe ($target.StartsWith('#')) "$Context references a non-local url() target"
    }
    # A renderer-controlled layer's visibility is owned by `data-active`; the
    # authored `display:none` would otherwise pin it permanently hidden.
    if ($IsDynamicLayer -and $property -eq 'display') { continue }
    $result[$AllowedStyleProperties[$property]] = $propertyValue
  }
  return $result
}

function Write-Record {
  param([System.Text.StringBuilder] $Builder, $Map)
  if ($null -eq $Map -or $Map.Count -eq 0) { return $false }
  [void]$Builder.Append('{')
  $first = $true
  foreach ($key in $Map.Keys) {
    if (-not $first) { [void]$Builder.Append(',') }
    $first = $false
    [void]$Builder.Append((ConvertTo-TsString $key))
    [void]$Builder.Append(':')
    [void]$Builder.Append((ConvertTo-TsString ([string]$Map[$key])))
  }
  [void]$Builder.Append('}')
  return $true
}

function Write-Node {
  param(
    [System.Xml.XmlElement] $Element,
    [System.Text.StringBuilder] $Builder,
    [System.Collections.Generic.HashSet[string]] $LayerIds,
    [string] $AssetKey
  )

  $tag = $Element.LocalName
  Assert-Safe ($AllowedElements.Contains($tag)) "$AssetKey contains disallowed element '<$tag>'"

  $elementId = $Element.GetAttribute('id')
  $isGradient = ($tag -eq 'linearGradient' -or $tag -eq 'radialGradient')
  $isDynamic = ($elementId -and $DynamicLayerIds.Contains($elementId))
  if ($isDynamic) { [void]$LayerIds.Add($elementId) }

  $props = [ordered]@{}
  $style = $null

  foreach ($attribute in $Element.Attributes) {
    $name = $attribute.Name
    $value = $attribute.Value
    Assert-Safe (-not $name.StartsWith('on')) "$AssetKey has an event handler attribute '$name'"
    Assert-Safe ($name -ne 'href' -and $name -ne 'xlink:href' -and $name -ne 'src') "$AssetKey has an external reference attribute '$name'"

    if ($ControlAttributes.Contains($name)) { continue }
    if ($AllowedAttributes.Contains($name)) {
      $props[$AllowedAttributes[$name]] = $value
      continue
    }
    if ($AllowedDataAttributes.Contains($name)) {
      $props[$name] = $value
      continue
    }
    throw "Odontogram asset rejected: $AssetKey has disallowed attribute '$name' on <$tag>"
  }

  # Gradients are referenced by local `url(#id)`; their id is the only one kept.
  if ($isGradient) {
    Assert-Safe ($elementId -ne '') "$AssetKey has a gradient without an id"
    $props['id'] = $elementId
  }
  elseif ($elementId) {
    if ($isDynamic) { $props['data-layer'] = $elementId }
    elseif ($tag -ne 'svg') { $props['data-group'] = $elementId }
  }

  $styleAttribute = $Element.GetAttribute('style')
  if ($styleAttribute) {
    $style = Convert-StyleAttribute -Value $styleAttribute -IsDynamicLayer $isDynamic -Context "$AssetKey <$tag id=$elementId>"
  }

  # A renderer-controlled layer receives `data-active` while rendering.
  if (-not $isDynamic) {
    $authoredActive = $Element.GetAttribute('data-active')
    if ($authoredActive) { $props['data-active'] = $authoredActive }
  }

  [void]$Builder.Append('n(')
  [void]$Builder.Append((ConvertTo-TsString $tag))
  [void]$Builder.Append(',')
  if (-not (Write-Record -Builder $Builder -Map $props)) { [void]$Builder.Append('E') }
  [void]$Builder.Append(',')
  if (-not (Write-Record -Builder $Builder -Map $style)) { [void]$Builder.Append('null') }
  [void]$Builder.Append(',')
  [void]$Builder.Append($(if ($isDynamic) { ConvertTo-TsString $elementId } else { 'null' }))
  [void]$Builder.Append(',')

  $children = @()
  foreach ($child in $Element.ChildNodes) {
    if ($child.NodeType -ne [System.Xml.XmlNodeType]::Element) { continue }
    if ($DroppedElements.Contains($child.LocalName)) { continue }
    $children += , $child
  }

  if ($children.Count -eq 0) {
    [void]$Builder.Append('C')
  }
  else {
    [void]$Builder.Append('[')
    for ($index = 0; $index -lt $children.Count; $index++) {
      if ($index -gt 0) { [void]$Builder.Append(',') }
      Write-Node -Element $children[$index] -Builder $Builder -LayerIds $LayerIds -AssetKey $AssetKey
    }
    [void]$Builder.Append(']')
  }
  [void]$Builder.Append(')')
}

# --- Generate ---------------------------------------------------------------
Assert-Safe (Test-Path -LiteralPath $AssetDirectory) "asset directory '$AssetDirectory' does not exist"

$assets = Get-ChildItem -LiteralPath $AssetDirectory -Filter '*.svg' -File | Sort-Object -Property Name
Assert-Safe ($assets.Count -gt 0) "no measured assets found in '$AssetDirectory'"

$out = [System.Text.StringBuilder]::new(6 * 1024 * 1024)
[void]$out.AppendLine('// GENERATED FILE - DO NOT EDIT BY HAND.')
[void]$out.AppendLine('// Produced by scripts/generate-odontogram-svg-nodes.ps1 from the reviewed,')
[void]$out.AppendLine('// repository-owned assets in src/components/odontogram/assets/measured.')
[void]$out.AppendLine('//')
[void]$out.AppendLine('// Anatomy originates in the controlled fork Ditherys/React-Odontogram-Modul at')
[void]$out.AppendLine("// commit $ForkCommit ($ForkAssetPath),")
[void]$out.AppendLine('// itself derived from ZoliQua/React-Odontogram-Modul. MIT licensed; the upstream')
[void]$out.AppendLine('// copyright and permission notice is preserved verbatim in THIRD_PARTY_NOTICES.md.')
[void]$out.AppendLine('//')
[void]$out.AppendLine('// This module is plain data. It contains no markup and no executable text.')
[void]$out.AppendLine('// Regenerate with: pwsh -File scripts/generate-odontogram-svg-nodes.ps1')
[void]$out.AppendLine('')
[void]$out.AppendLine('export type MeasuredSvgNode = {')
[void]$out.AppendLine('  readonly tag: string;')
[void]$out.AppendLine('  readonly props: Readonly<Record<string, string>>;')
[void]$out.AppendLine('  readonly style: Readonly<Record<string, string>> | null;')
[void]$out.AppendLine('  /** Renderer-controlled clinical layer id, or null for structural artwork. */')
[void]$out.AppendLine('  readonly layer: string | null;')
[void]$out.AppendLine('  readonly children: readonly MeasuredSvgNode[];')
[void]$out.AppendLine('};')
[void]$out.AppendLine('')
[void]$out.AppendLine('const E: Readonly<Record<string, string>> = Object.freeze({});')
[void]$out.AppendLine('const C: readonly MeasuredSvgNode[] = Object.freeze([]);')
[void]$out.AppendLine('')
[void]$out.AppendLine('const n = (')
[void]$out.AppendLine('  tag: string,')
[void]$out.AppendLine('  props: Readonly<Record<string, string>>,')
[void]$out.AppendLine('  style: Readonly<Record<string, string>> | null,')
[void]$out.AppendLine('  layer: string | null,')
[void]$out.AppendLine('  children: readonly MeasuredSvgNode[],')
[void]$out.AppendLine('): MeasuredSvgNode => Object.freeze({ tag, props, style, layer, children });')
[void]$out.AppendLine('')
[void]$out.AppendLine("export const MEASURED_SVG_SOURCE_COMMIT = `"$ForkCommit`";")
[void]$out.AppendLine("export const MEASURED_SVG_SOURCE_PATH = `"$ForkAssetPath`";")
[void]$out.AppendLine("export const MEASURED_SVG_GENERATOR_VERSION = `"$GeneratorVersion`";")
[void]$out.AppendLine('')

$hashLines = New-Object System.Collections.Generic.List[string]
$layerLines = New-Object System.Collections.Generic.List[string]
$treeLines = New-Object System.Collections.Generic.List[string]

foreach ($asset in $assets) {
  $assetKey = [System.IO.Path]::GetFileNameWithoutExtension($asset.Name)
  Assert-Safe ($assetKey -match '^[0-9]{2}(_occl)?$') "unexpected asset file name '$($asset.Name)'"

  $raw = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($asset.FullName))
  Assert-Safe (-not ($raw -match '(?i)<script|<foreignObject|<image|<use\b|javascript:|xlink:href|\bhref\s*=|<!ENTITY|<!DOCTYPE')) `
    "$assetKey contains a forbidden construct"

  $document = Read-SecureSvgDocument -Path $asset.FullName
  $root = $document.DocumentElement
  Assert-Safe ($root.LocalName -eq 'svg') "$assetKey root element is not <svg>"

  $layerIds = [System.Collections.Generic.HashSet[string]]::new()
  $nodeBuilder = [System.Text.StringBuilder]::new(256 * 1024)
  Write-Node -Element $root -Builder $nodeBuilder -LayerIds $layerIds -AssetKey $assetKey

  $treeLines.Add("  `"$assetKey`": $($nodeBuilder.ToString()),")
  $sorted = @($layerIds) | Sort-Object
  $layerLines.Add("  `"$assetKey`": Object.freeze([$(($sorted | ForEach-Object { ConvertTo-TsString $_ }) -join ',')]),")
  $hashLines.Add("  `"$assetKey`": `"$(Get-NormalisedSha256 -Path $asset.FullName)`",")

  Write-Verbose "generated $assetKey ($($layerIds.Count) renderer-controlled layers)"
}

[void]$out.AppendLine('/** SHA-256 of each source asset, over LF-normalised UTF-8 bytes. */')
[void]$out.AppendLine('export const MEASURED_ASSET_SHA256: Readonly<Record<string, string>> = Object.freeze({')
foreach ($line in $hashLines) { [void]$out.AppendLine($line) }
[void]$out.AppendLine('});')
[void]$out.AppendLine('')
[void]$out.AppendLine('/** Renderer-controlled layer ids present in each installed template. */')
[void]$out.AppendLine('export const MEASURED_TEMPLATE_LAYER_IDS: Readonly<Record<string, readonly string[]>> = Object.freeze({')
foreach ($line in $layerLines) { [void]$out.AppendLine($line) }
[void]$out.AppendLine('});')
[void]$out.AppendLine('')
[void]$out.AppendLine('export const MEASURED_SVG_TREES: Readonly<Record<string, MeasuredSvgNode>> = Object.freeze({')
foreach ($line in $treeLines) { [void]$out.AppendLine($line) }
[void]$out.AppendLine('});')

$outputDirectory = Split-Path -Parent $OutputFile
if (-not (Test-Path -LiteralPath $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$encoding = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($OutputFile, ($out.ToString() -replace "`r`n", "`n"), $encoding)

Write-Host "Generated $OutputFile from $($assets.Count) reviewed assets."

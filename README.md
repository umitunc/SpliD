<p align="center">
  <img src="docs/logo/splid-logo.png" width="180" alt="SpliD Logo" />
</p>

<h1 align="center">SpliD — Automatic Cross-Platform 3D Model Splitter</h1>

<p align="center">
  A cross-platform (Windows, macOS, Linux) Electron desktop application providing a <strong>4-step, zero-friction workflow</strong> to automatically split oversized 3D models into watertight, printable parts with adaptive alignment pins.
</p>

---

## Problem

Large 3D models (architectural props, planters, helmets, cosplay armor, industrial enclosures) frequently exceed the build volume of desktop FDM/SLA printers. Existing workflows rely on manual planar cuts inside slicers or general-purpose CAD tools, which introduces several recurring failures:

1. **Manual Trial-and-Error:** Users must repeatedly guess cut coordinates across $X$, $Y$, and $Z$ axes and verify bounding boxes one piece at a time.
2. **Thin Slivers & Runt Fragments:** Naive uniform or max-bed cuts often leave narrow, fragile edge fragments (slivers) that warp, detach from the bed, or waste filament.
3. **High-Visibility / High-Stress Seams:** Arbitrary cut planes slice right through thick structural regions or wide decorative faces instead of narrower cross-sections.
4. **Wall Perforation from Fixed Pins:** Fixed-diameter alignment dowels punch through thin shells ($< 6\text{ mm}$), ruining curved or hollow prints.
5. **Non-Manifold Exports:** Mesh-level boolean tools frequently produce open edges, inverted normals, or non-watertight STLs.

## Objective

SpliD eliminates manual cutting by automating the entire pipeline from raw mesh import to ready-to-slice ZIP/STL export:

- **Minimize total part count** while guaranteeing every output part strictly fits the active printer's effective build volume.
- **Eliminate fragile slivers** through balanced tail distribution, multi-candidate axis ordering, and post-split manifold merging.
- **Minimize seam footprint** by shifting each cut plane within a bounded window to the narrowest local cross-section.
- **Preserve thin walls** using a 3-tier adaptive connector strategy and generate a ready-to-print **Connector Pins KitCard** STL when standard pins are used.
- **Guarantee watertight geometry** via exact CSG boolean operations powered by `manifold-3d` (WebAssembly) inside a dedicated Web Worker.

---

## Solution Approach & Splitting Algorithm

SpliD implements a **Hierarchical Adaptive KD-Split** pipeline (`optimalPlanner.ts` + `csgEngine.ts`) executed off the main UI thread.

### 1. Effective Build Volume & Safety Margin

Given a printer's physical build volume $B = (B_x, B_y, B_z)$ and user-configured safety margin $m \ge 0$ (in $\text{mm}$), the usable effective build volume $B_{\text{eff}}$ reserves clearance on both sides of $X/Y$ and at the top of $Z$:

$$
B_{\text{eff}} = \Big(\max(20,\; B_x - 2m),\;\; \max(20,\; B_y - 2m),\;\; \max(20,\; B_z - m)\Big)
$$

### 2. Optimal $0^\circ$ vs. $90^\circ$ $Z$-Axis Orientation

Before cutting, SpliD evaluates whether rotating the model by $90^\circ$ around the $Z$-axis reduces the estimated grid part count ($S = (S_x, S_y, S_z)$, $\varepsilon = 10^{-4}$):

$$
N_0 = \left\lceil\frac{S_x - \varepsilon}{B_{\text{eff},x}}\right\rceil \left\lceil\frac{S_y - \varepsilon}{B_{\text{eff},y}}\right\rceil \left\lceil\frac{S_z - \varepsilon}{B_{\text{eff},z}}\right\rceil, \qquad
N_{90} = \left\lceil\frac{S_y - \varepsilon}{B_{\text{eff},x}}\right\rceil \left\lceil\frac{S_x - \varepsilon}{B_{\text{eff},y}}\right\rceil \left\lceil\frac{S_z - \varepsilon}{B_{\text{eff},z}}\right\rceil
$$

If $N_{90} < N_0$, the $90^\circ$ orientation is selected. On a tie ($N_{90} = N_0$), SpliD chooses $90^\circ$ if its minimum per-piece slack exceeds the $0^\circ$ slack by more than $0.5\text{ mm}$:

$$
\text{slack}(\theta) = \min\!\left(B_{\text{eff},x} - \frac{S'_x}{n_x},\;\; B_{\text{eff},y} - \frac{S'_y}{n_y}\right)
$$

### 3. Anti-Sliver Nominal Cut Placement

For any axis span $L = c_{\max} - c_{\min} > L_{\max}$ (where $L_{\max} = B_{\text{eff},\text{axis}}$), the minimum piece count is $k = \lceil (L - \varepsilon) / L_{\max} \rceil$ and the minimum tail span threshold is:

$$
t_{\min} = \max\big(t_{\text{user}},\;\; 0.35 \cdot L_{\max}\big)
$$

Two complementary nominal strategies are evaluated across candidate pipelines:

- **Balanced (`balanced`):** Equal-span divisions at $c_i = c_{\min} + i \cdot \frac{L}{k}$ for $i = 1, \dots, k - 1$.
- **Max-Fit / Center-Symmetric (`max-fit`):**
  - When $k = 3$, a full $L_{\max}$-wide section is centered at $\frac{c_{\min} + c_{\max}}{2}$ so curved or cylindrical outer caps remain large and symmetric rather than producing tiny corner fragments.
  - For $k \neq 3$, cuts advance at $0.96 \cdot L_{\max}$ (clamped so remaining pieces can still fit) and split the final two pieces evenly if the trailing remainder falls below $t_{\min}$.

### 4. Seam Minimization via Cross-Section Perimeter Proxy

Around each nominal coordinate $c_{\text{nom}}$, SpliD defines a constrained valid search interval $[c_{\text{low}}, c_{\text{high}}]$ bounded by the seam optimization window $w_{\text{seam}}$, minimum piece thickness $t_{\text{user}}$, and maximum bed span $L_{\max}$.

At each candidate plane $\Pi_c$ sampled every $2.0\text{ mm}$, SpliD computes the total intersection segment length of all mesh triangles crossing $\Pi_c$:

$$
P(c) = \sum_{T \cap \Pi_c \neq \emptyset} \|\mathbf{p}_1(c) - \mathbf{p}_0(c)\|_2
$$

The optimal cut coordinate minimizes cross-section perimeter with a small regularization penalty against unnecessary drift from $c_{\text{nom}}$:

$$
c^* = \arg\min_{c \in [c_{\text{low}},\, c_{\text{high}}]} \Big( P(c) + 0.05\,|c - c_{\text{nom}}| \Big)
$$

### 5. Hierarchical Adaptive KD-Split & Candidate Scoring

Rather than applying a rigid global grid, SpliD runs multiple candidate pipelines (varying axis orderings such as `x-y-z`, `y-x-z`, `z-x-y`, `z-y-x` and cut styles `max-fit` vs. `balanced`). At each depth, every resulting sub-manifold is decomposed against its **own tight bounding box** (and disconnected components are separated when adaptive hierarchy is enabled), then adjacent small manifolds are greedily merged if their combined bounding box fits inside $B_{\text{eff}}$.

Each candidate set of $N$ output manifolds with volumes $\{V_i\}_{i=1}^N$ and mean volume $\bar{V} = \frac{1}{N}\sum_{i=1}^N V_i$ is ranked by a runt-penalty objective (lower is better):

$$
\mathcal{L}_{\text{cand}} = 50000 \cdot N_{\text{severe}} + 8000 \cdot N_{\text{runt}} + 100 \cdot N - 300 \cdot \frac{V_{\min}}{\bar{V}}
$$

where $N_{\text{severe}}$ counts pieces with $V_i / \bar{V} < 0.10$, and $N_{\text{runt}}$ counts pieces with $V_i / \bar{V} < 0.22$ or maximum dimension $< 50\text{ mm}$.

### 6. 3-Tier Adaptive Alignment Pin & Thin-Wall Safety

For every cut plane between adjacent manifolds $A$ and $B$, SpliD extracts a $0.4\text{ mm}$ CSG cross-section slice on each side and measures the overlapping bounding span $(\Delta u, \Delta v)$. Let $w_{\min} = \min(\Delta u, \Delta v)$:

| Tier | Condition ($w_{\min}$) | Action | Hole Diameter | Hole Depth |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1 — Standard Dowel** | $w_{\min} \ge 14.0\text{ mm}$ | Cylindrical dowel pin cavity | $d_{\text{pin}} + \delta_{\text{clear}}$ | $h_{\text{pin}}$ |
| **Tier 2 — Raw Filament Pin** | $6.0\text{ mm} \le w_{\min} < 14.0\text{ mm}$ | $1.75\text{ mm}$ raw filament alignment hole | $1.95\text{ mm}$ | $\min(5.0,\; 0.45\,w_{\min})$ |
| **Tier 3 — Thin-Wall Skip** | $w_{\min} < 6.0\text{ mm}$ | Pin omitted to prevent wall perforation | — | — |

When standard dowel pins are generated, SpliD automatically synthesizes a 1-piece watertight **Connector Pins KitCard** STL containing the exact required pin count with chamfered tips and snap-off gates.

---

## 4-Step Workflow & Features

1. **Load Model (`STL` / `OBJ` / `3MF`):** Drag-and-drop or browse to import; automatically centers the mesh on the build plate and measures `X × Y × Z mm`, volume ($\text{cm}^3$), and triangle count.
2. **Smart Scaling:** Aspect-ratio-locked target `X / Y / Z mm` or `%` scaling with one-click `Inch → mm (×25.4)` and `cm → mm (×10)` unit conversion.
3. **65+ Printer Build Plate Database (`printers.json`):** Built-in profiles for Bambu Lab, Creality, Prusa, Anycubic, Elegoo, Voron, Qidi, FlashForge, Sovol, UltiMaker, Artillery, RatRig, and Phrozen, plus custom build volumes.
4. **Split & Export:** Interactive 3D viewport with Exploded View slider, live build-plate dimensions, assembly guide (`README_ASSEMBLY.txt`), and one-click ZIP/STL export.

---

## Development & Build

```bash
# Install dependencies
npm install

# Start in development mode
npm run dev

# TypeScript check and unit tests
npm run typecheck
npm test

# Production build
npm run build
```

---

## Credits

| | |
| :--- | :--- |
| **Developer** | Ümit Tunç |
| **Organization** | Trunçgil Teknoloji |
| **Website** | [truncgil.com](https://truncgil.com) |
| **License** | MIT |

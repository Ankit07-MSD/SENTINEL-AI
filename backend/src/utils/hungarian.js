/**
 * Hungarian Algorithm (Munkres) — solves the assignment problem: given an
 * n x m cost matrix, find the assignment of rows to columns that MINIMIZES
 * total cost, with each row and column used at most once.
 *
 * This is the mathematical core of Section 11 (Response Optimization):
 *   "Minimize total weighted response time" subject to each resource being
 *   assigned to at most one incident and vice versa.
 *
 * Implementation: standard O(n^3) Munkres algorithm. Non-square matrices are
 * padded with dummy rows/columns of cost 0 (their assignments are discarded
 * by the caller) since Munkres classically operates on square matrices.
 *
 * Usage:
 *   const { solve } = require('./hungarian');
 *   const assignment = solve(costMatrix); // returns array: assignment[i] = j
 */
function solve(costMatrix) {
  const nRows = costMatrix.length;
  const nCols = nRows > 0 ? costMatrix[0].length : 0;
  const n = Math.max(nRows, nCols);

  // pad to square matrix with 0-cost dummy entries
  const cost = [];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j < n; j++) {
      row.push(i < nRows && j < nCols ? costMatrix[i][j] : 0);
    }
    cost.push(row);
  }

  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0); // p[j] = row assigned to column j
  const way = new Array(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);

    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = -1;

      for (let j = 1; j <= n; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  // build row -> column assignment, ignoring dummy pads
  const assignment = new Array(nRows).fill(-1);
  for (let j = 1; j <= n; j++) {
    const row = p[j] - 1;
    const col = j - 1;
    if (row < nRows && col < nCols) {
      assignment[row] = col;
    }
  }
  return assignment;
}

module.exports = { solve };

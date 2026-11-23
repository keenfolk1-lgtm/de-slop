export function generateSlopBadge({ score, grade }) {
  const color = score <= 10 ? "#248A3D" : score <= 30 ? "#0071E3" : score <= 60 ? "#B25000" : "#D70015";
  const label = "de-slop";
  const value = `${grade} (${score}/100)`;
  const leftW = 64;
  const rightW = Math.max(76, value.length * 7 + 16);
  const totalW = leftW + rightW;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="20" role="img" aria-label="${label}: ${value}">
  <rect width="${leftW}" height="20" rx="4" fill="#1D1D1F"/>
  <rect x="${leftW - 4}" width="${rightW + 4}" height="20" rx="4" fill="${color}"/>
  <rect x="${leftW - 4}" width="4" height="20" fill="${color}"/>
  <text x="${leftW / 2}" y="14" fill="#FFFFFF" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="11" font-weight="600">${label}</text>
  <text x="${leftW + rightW / 2}" y="14" fill="#FFFFFF" text-anchor="middle" font-family="'Cascadia Mono',Consolas,monospace" font-size="11" font-weight="600">${value}</text>
</svg>
`;
}

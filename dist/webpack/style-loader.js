module.exports = src => {
  const match = src
    .match(/styleUrls: \[(?<styleUrls>[^\]]+)\]/);

  if(!match) return src;

  const split = match.groups.styleUrls.split(',');

  return split.map(path => 'import ' + path.trim() + ';')
    .join('\n')
    + '\n' + src;
}
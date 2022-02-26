module.exports = src => {
  const styleUrls = src
    .match(/styleUrls: \[(?<styleUrls>[^\]]+)\]/)
    ?.groups.styleUrls ?? null;

  if(!styleUrls) return src;

  const split = styleUrls.split(',');

  return split.map(path => 'import ' + path + ';')
    .join('\n')
    + '\n' + src;
}
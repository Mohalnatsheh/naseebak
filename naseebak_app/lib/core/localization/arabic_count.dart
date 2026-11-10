/// A counted noun the Arabic way (the website's `arabicCount`): 1 and 2 have their own words, 3–10 take the plural,
/// 11 and up the singular accusative. «محادثة واحدة» / «محادثتين» / «3 محادثات» / «12 محادثة».
String arabicCount(int n, {required String one, required String two, required String few, required String many}) {
  if (n == 1) return one;
  if (n == 2) return two;
  final mod100 = n % 100;
  if (mod100 >= 3 && mod100 <= 10) return '$n $few';
  return '$n $many';
}

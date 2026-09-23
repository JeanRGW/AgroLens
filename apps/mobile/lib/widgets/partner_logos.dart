import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

const kPartnerLogos = [
  'agronomia_logo.png',
  'BDA_logo.png',
  'CC_logo.png',
  'agraria_logo.svg',
  'capes_logo.png',
  'FA_logo.png',
  'CNPq_logo.svg',
  'NMAP_logo.png',
  'UNICENTRO_logo.png',
];

Widget buildPartnerLogo(String name, {BoxFit fit = BoxFit.contain}) {
  if (name.endsWith('.svg')) {
    return SvgPicture.asset('assets/logo/$name', fit: fit);
  }
  return Image.asset('assets/logo/$name', fit: fit);
}

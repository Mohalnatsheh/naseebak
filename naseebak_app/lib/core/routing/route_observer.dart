import 'package:flutter/widgets.dart';

/// The root navigator's route observer: a screen that must know whether it is on top (the chat marks messages read
/// only then) subscribes with `RouteAware`.
final appRouteObserver = RouteObserver<ModalRoute<dynamic>>();

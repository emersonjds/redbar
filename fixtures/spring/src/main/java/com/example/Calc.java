package com.example;

public class Calc {
  public int add(int a, int b) {
    return a + b;
  }

  public int divide(int a, int b) {
    if (b == 0) throw new IllegalArgumentException("divide by zero");
    return a / b;
  }
}
